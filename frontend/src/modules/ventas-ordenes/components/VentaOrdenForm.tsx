import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useObras } from '@/modules/obras/hooks/useObras';
import { ObraForm } from '@/modules/obras/components/ObraForm';
import { obraService } from '@/modules/obras/services/obraService';
import { ObraFormData } from '@/modules/obras/types';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { ventaOrdenesService } from '../services/ventaOrdenesService';
import {
  VehiculoOrden,
  VentaOrden,
  VentaOrdenFormData,
  VentaOrdenItemFormData,
} from '../types';
import { VehiculosOrdenField } from './VehiculosOrdenField';

interface VentaOrdenFormProps {
  /** Si viene, es edición: cliente y obra ya no se pueden cambiar. */
  orden?: VentaOrden;
  onSubmit: (data: VentaOrdenFormData) => Promise<boolean>;
  onCancel: () => void;
}

/** Una fila de material vista por el formulario. `despachadoM3` solo existe en
 *  filas que ya vivían en la orden (edición) y sirve para bloquear su borrado
 *  y su material — cambiar el material de una línea ya persistida equivale a
 *  borrarla y crear otra, y eso el backend lo rechaza si tiene despachos. */
interface FilaMaterial extends VentaOrdenItemFormData {
  esExistente: boolean;
  despachadoM3: number;
}

const filaVacia = (): FilaMaterial => ({
  materialId: '',
  m3Asignados: '',
  esExistente: false,
  despachadoM3: 0,
});

export const VentaOrdenForm = ({ orden, onSubmit, onCancel }: VentaOrdenFormProps) => {
  const { clientes } = useClientes();
  const { obras, refetch: refetchObras } = useObras();
  const { materiales } = useMateriales();

  const esEdicion = Boolean(orden);

  const [clientId, setClientId] = useState(orden ? String(orden.clientId) : '');
  const [constSiteId, setConstSiteId] = useState(orden ? String(orden.constSiteId) : '');
  const [observacion, setObservacion] = useState(orden?.observacion ?? '');
  // Placas viejas (texto): ya no se editan, se conservan tal cual al guardar.
  const placas = (orden?.placas ?? []).join(', ');
  const [vehiculos, setVehiculos] = useState<VehiculoOrden[]>(orden?.vehiculos ?? []);
  const [filas, setFilas] = useState<FilaMaterial[]>(() =>
    orden && orden.items.length
      ? orden.items.map((item) => ({
          materialId: String(item.materialId),
          m3Asignados: String(item.m3Asignados),
          esExistente: true,
          despachadoM3: item.despachadoM3,
        }))
      : [filaVacia()]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNotificando, setIsNotificando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [isObraFormOpen, setIsObraFormOpen] = useState(false);
  const [isSavingObra, setIsSavingObra] = useState(false);
  // El modal se cierra apenas el guardado sale bien (lo hace la página, no
  // este formulario), así que para cuando el aviso de Telegram termina este
  // componente ya pudo desmontarse — evita el setState de un desmontado.
  const montadoRef = useRef(true);
  // Se vuelve a poner en true al montar: StrictMode desmonta y remonta en dev.
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // Cualquier cambio después de guardar vuelve a ocultar "Enviar a Telegram".
  useEffect(() => {
    setGuardado(false);
  }, [filas, vehiculos, observacion]);

  const clienteSeleccionado = clientes.find((c) => String(c.id) === clientId);
  const tipoCliente = (() => {
    const tipo = orden?.client.type ?? clienteSeleccionado?.type;
    if (!tipo) return undefined;
    return tipo === 'PUBLICO' || tipo === 'PUBLIC' ? 'PUBLICO' : 'PRIVADO';
  })();

  const clientOptions = useMemo(
    () =>
      clientes
        .filter((cliente) => cliente.isActive)
        .map((cliente) => ({
          value: String(cliente.id),
          label: `${cliente.companyname || cliente.name}${
            cliente.ruc ? ` (${cliente.ruc})` : ''
          } — ${cliente.type === 'PUBLICO' || cliente.type === 'PUBLIC' ? 'Externa' : 'Interna'}`,
        })),
    [clientes]
  );

  // Solo las obras ya vinculadas a ese cliente (ClientConstSite) — el backend
  // rechaza (OBRA_SIN_CLIENTE) una obra que no pertenezca al cliente elegido.
  const obraOptions = useMemo(() => {
    if (!clientId) return [];
    return obras
      .filter((obra) =>
        obra.clients?.some((relacion) => String(relacion.clientId) === clientId)
      )
      .map((obra) => ({ value: String(obra.id), label: obra.name }));
  }, [obras, clientId]);

  const materialOptionsBase = useMemo(
    () =>
      materiales.map((m) => ({
        value: String(m.id),
        label: formatMaterialType(m.materialType),
      })),
    [materiales]
  );

  const materialOptionsPara = (indice: number) => {
    const elegidosEnOtrasFilas = new Set(
      filas.filter((_, i) => i !== indice).map((f) => f.materialId)
    );
    return materialOptionsBase.filter((op) => !elegidosEnOtrasFilas.has(op.value));
  };

  const handleClienteChange = (valor: string) => {
    setClientId(valor);
    setConstSiteId('');
    // Los vehículos dependen del cliente (externos de su proveedor o de la empresa).
    setVehiculos([]);
  };

  const actualizarFila = (indice: number, cambios: Partial<FilaMaterial>) => {
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, ...cambios } : f)));
  };

  const agregarFila = () => setFilas((prev) => [...prev, filaVacia()]);

  const quitarFila = (indice: number) => {
    setFilas((prev) => prev.filter((_, i) => i !== indice));
  };

  const handleGuardarObra = async (data: ObraFormData) => {
    try {
      setIsSavingObra(true);
      const creada = await obraService.create(data);
      await refetchObras();
      setConstSiteId(String(creada.id));
      setIsObraFormOpen(false);
      if (creada.yaExistia) {
        toast(`Ya existía la obra "${creada.name}": se seleccionó esa`, { icon: 'ℹ️' });
      } else {
        toast.success('Obra creada');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo crear la obra');
    } finally {
      setIsSavingObra(false);
    }
  };

  const validar = (): string | null => {
    if (!esEdicion) {
      if (!clientId) return 'Elija un cliente';
      if (!constSiteId) return 'Elija una obra';
    }
    if (!filas.length) return 'Agregue al menos un material';
    for (const fila of filas) {
      if (!fila.materialId) return 'Todas las líneas necesitan un material';
      const cantidad = Number(fila.m3Asignados.replace(',', '.'));
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return 'Todas las líneas necesitan una cantidad mayor a cero';
      }
    }
    const materialesUnicos = new Set(filas.map((f) => f.materialId));
    if (materialesUnicos.size !== filas.length) {
      return 'No se puede repetir el mismo material en dos líneas';
    }
    return null;
  };

  const construirDatos = (): VentaOrdenFormData => ({
    clientId,
    constSiteId,
    observacion,
    placas,
    vehiculos,
    items: filas.map(({ materialId, m3Asignados }) => ({ materialId, m3Asignados })),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errorValidacion = validar();
    if (errorValidacion) {
      toast.error(errorValidacion);
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onSubmit(construirDatos());
      if (ok && montadoRef.current) setGuardado(true);
    } finally {
      if (montadoRef.current) setIsSubmitting(false);
    }
  };
  
  const handleNotificar = async () => {
    if (!orden) return;
    setIsNotificando(true);
    try {
      const { enviados } = await ventaOrdenesService.notificar(orden.id);
      if (enviados > 0) {
        toast.success(
          `Aviso enviado a ${enviados} supervisor${enviados === 1 ? '' : 'es'} de cantera`
        );
      } else {
        toast('Nadie tiene Telegram vinculado todavía — nadie recibió el aviso', {
          icon: '⚠️',
        });
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo enviar el aviso a Telegram');
    } finally {
      if (montadoRef.current) setIsNotificando(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {esEdicion ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-50 border rounded-lg p-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Cliente</p>
              <p className="text-sm text-gray-900">
                {orden?.client.companyname}{' '}
                <span className="text-xs text-gray-500">
                  ({orden?.client.type === 'PUBLICO' ? 'Externa' : 'Interna'})
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Obra</p>
              <p className="text-sm text-gray-900">{orden?.constSite.name}</p>
            </div>
            <p className="md:col-span-2 text-xs text-gray-500">
              El cliente y la obra no se pueden cambiar una vez creada la orden.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect
              label="Cliente"
              required
              options={clientOptions}
              value={clientId}
              onChange={handleClienteChange}
              placeholder="Buscar cliente por razón social o RUC"
            />
            <div>
              <SearchableSelect
                label="Obra"
                required
                disabled={!clientId}
                options={obraOptions}
                value={constSiteId}
                onChange={setConstSiteId}
                placeholder={clientId ? 'Elija la obra' : 'Elija primero el cliente'}
                emptyMessage="Este cliente no tiene obras. Cree una nueva."
              />
              {clientId && (
                <button
                  type="button"
                  onClick={() => setIsObraFormOpen(true)}
                  className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Nueva obra para {clienteSeleccionado?.companyname ?? 'este cliente'}
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900">Materiales de la orden</p>
            <Button type="button" size="sm" variant="outline" 
               className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
              icon={<Plus size={14} />} onClick={agregarFila}>
              Agregar material
            </Button>
          </div>

          <div className="space-y-2">
            {filas.map((fila, indice) => {
              const bloqueada = fila.esExistente && fila.despachadoM3 > 0;
              return (
                <div key={indice} className="flex items-end gap-2 bg-gray-50 border rounded-lg p-2">
                  <div className="flex-1">
                    <SearchableSelect
                      label={indice === 0 ? 'Material' : undefined}
                      options={materialOptionsPara(indice)}
                      value={fila.materialId}
                      onChange={(valor) => actualizarFila(indice, { materialId: valor })}
                      disabled={fila.esExistente}
                      placeholder="Elija el material"
                    />
                  </div>
                  <div className="w-36">
                    <Input
                      label={indice === 0 ? 'm³ asignados' : undefined}
                      type="number"
                      step="0.001"
                      min="0"
                      value={fila.m3Asignados}
                      onChange={(e) => actualizarFila(indice, { m3Asignados: e.target.value })}
                      placeholder="Ej: 500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarFila(indice)}
                    disabled={bloqueada}
                    title={
                      bloqueada
                        ? 'No se puede quitar: esta línea ya tiene despachos'
                        : 'Quitar línea'
                    }
                    className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed p-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <VehiculosOrdenField
          clientId={clientId}
          tipoCliente={tipoCliente}
          value={vehiculos}
          onChange={setVehiculos}
        />
        {placas && (
          <p className="text-xs text-gray-500 -mt-2">
            Placas registradas antes (texto): {placas}
          </p>
        )}

        <Input
          label="Observación (opcional)"
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline"
             className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            onClick={onCancel}>
            {guardado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {esEdicion && guardado && (
            <Button
              type="button"
              variant="outline"
              icon={<Send size={14} />}
              isLoading={isNotificando}
              onClick={handleNotificar}
              title="Avisa por Telegram a los supervisores de cantera con lo ya guardado"
            >
              Enviar a Telegram
            </Button>
          )}
          <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isNotificando}>
            {esEdicion ? 'Guardar cambios' : 'Crear orden'}
          </Button>
        </div>
      </form>

      <Modal
        isOpen={isObraFormOpen}
        onClose={() => setIsObraFormOpen(false)}
        title={`Nueva obra para ${clienteSeleccionado?.companyname ?? 'el cliente'}`}
        size="lg"
      >
        <ObraForm
          initialClientId={clientId}
          onSubmit={handleGuardarObra}
          onCancel={() => setIsObraFormOpen(false)}
        />
        {isSavingObra && <p className="text-xs text-gray-500 mt-2">Guardando...</p>}
      </Modal>
    </>
  );
};
