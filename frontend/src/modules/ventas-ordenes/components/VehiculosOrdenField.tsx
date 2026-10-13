import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { vehicleService } from '@/modules/vehicles/services/vehicleService';
import { Vehicle, VEHICLE_COMPANY_LABELS, VehicleCompany } from '@/modules/vehicles/types';
import { ventaOrdenesService } from '../services/ventaOrdenesService';
import { VehiculoOrden } from '../types';

interface VehiculosOrdenFieldProps {
  clientId: string;
  /** PUBLICO: vehículos externos del proveedor del cliente. PRIVADO: de la empresa. */
  tipoCliente?: 'PUBLICO' | 'PRIVADO';
  value: VehiculoOrden[];
  onChange: (vehiculos: VehiculoOrden[]) => void;
}

const inputClass =
  'w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-night-border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-600';

/** Misma regla que Vehículos y que el backend: 3 letras y 3 o 4 números, sin guion. */
const PLACA_COMPLETA = /^[A-Z]{3}\d{3,4}$/;

/** Formatea mientras se escribe, sin guion: "pbx-0123" → "PBX0123". */
const formatearPlaca = (texto: string) => {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letras = limpio.slice(0, 3).replace(/[^A-Z]/g, '');
  const numeros = limpio.slice(letras.length).replace(/\D/g, '').slice(0, 4);
  return `${letras}${numeros}`;
};

const mensajeError = (error: any, porDefecto: string) => {
  const msg = error?.response?.data?.message;
  return (Array.isArray(msg) ? msg.join(', ') : msg) || porDefecto;
};

/** Enter no envía el formulario de la orden ni agrega: se agrega con el botón. */
const bloquearEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.preventDefault();
};

/**
 * Vehículos de una orden: placa + m³ y el botón "Agregar". Si la placa ya
 * está registrada se completa sola con su cubicaje real. Para un cliente
 * público el backend crea el vehículo externo con su proveedor; para uno
 * privado se elige un vehículo de la empresa o se crea con su ID y empresa.
 */
export const VehiculosOrdenField = ({
  clientId,
  tipoCliente,
  value,
  onChange,
}: VehiculosOrdenFieldProps) => {
  const [placa, setPlaca] = useState('');
  const [m3, setM3] = useState('');
  const [vehicleid, setVehicleid] = useState('');
  const [company, setCompany] = useState<VehicleCompany>('CIUDAD_RODRIGO');
  const [creandoInterno, setCreandoInterno] = useState(false);
  const [isAgregando, setIsAgregando] = useState(false);
  const [internos, setInternos] = useState<Vehicle[]>([]);
  // Vehículo ya registrado con la placa escrita: su cubicaje manda.
  const [registrado, setRegistrado] = useState<VehiculoOrden | null>(null);
  const [buscando, setBuscando] = useState(false);

  const esPrivado = tipoCliente === 'PRIVADO';
  const placaCompleta = PLACA_COMPLETA.test(placa);

  useEffect(() => {
    if (!esPrivado) return;
    let activo = true;
    vehicleService
      .getAll()
      .then((lista) => {
        if (activo) {
          setInternos(lista.filter((v) => v.type === 'INTERNO' && v.isActive !== false));
        }
      })
      .catch(() => {
        if (activo) toast.error('No se pudieron cargar los vehículos de la empresa');
      });
    return () => {
      activo = false;
    };
  }, [esPrivado]);

  // Al completar la placa se consulta si ya existe, para traer su cubicaje real.
  useEffect(() => {
    setRegistrado(null);
    if (!placaCompleta) return;
    let activo = true;
    setBuscando(true);
    // Espera a que se deje de escribir: con 3 números la placa ya es válida
    // aunque falte el cuarto, y no debe buscar la placa equivocada.
    const espera = setTimeout(() => {
      ventaOrdenesService
        .buscarVehiculo(placa)
        .then((vehiculo) => {
          if (!activo) return;
          setRegistrado(vehiculo);
          if (vehiculo) setM3(String(vehiculo.capacity));
        })
        .catch(() => {
          // Sin conexión con la búsqueda se sigue igual: el backend vuelve a
          // comprobar la placa al agregar y nunca duplica el vehículo.
        })
        .finally(() => {
          if (activo) setBuscando(false);
        });
    }, 500);
    return () => {
      activo = false;
      clearTimeout(espera);
      setBuscando(false);
    };
  }, [placa, placaCompleta]);

  const internoOptions = useMemo(() => {
    const yaAgregados = new Set(value.map((v) => v.id));
    return internos
      .filter((v) => !yaAgregados.has(v.id))
      .map((v) => ({
        value: String(v.id),
        label: `${v.vehicleid} · ${v.plate} · ${v.capacity} m³`,
      }));
  }, [internos, value]);

  const agregar = (vehiculo: VehiculoOrden) => {
    if (value.some((v) => v.id === vehiculo.id)) {
      toast(`El vehículo ${vehiculo.plate} ya está en la orden`, { icon: 'ℹ️' });
      return false;
    }
    onChange([...value, vehiculo]);
    return true;
  };

  const elegirInterno = (id: string) => {
    const v = internos.find((x) => String(x.id) === id);
    if (!v) return;
    agregar({
      id: v.id,
      vehicleid: v.vehicleid,
      plate: v.plate,
      capacity: v.capacity,
      type: 'INTERNO',
    });
  };

  const limpiar = () => {
    setPlaca('');
    setM3('');
    setVehicleid('');
    setRegistrado(null);
  };

  const handleAgregar = async () => {
    if (!placaCompleta) {
      toast.error('La placa debe tener 3 letras y 3 o 4 números, sin guion (ABC123 o ABC1234)');
      return;
    }
    if (registrado) {
      if (agregar(registrado)) limpiar();
      return;
    }

    const capacidad = Number(m3.replace(',', '.'));
    if (!Number.isFinite(capacidad) || capacidad <= 0) {
      toast.error('Escribe el cubicaje (m³) mayor a cero');
      return;
    }
    if (esPrivado && !vehicleid.trim()) {
      toast.error('Escribe el ID del vehículo de la empresa');
      return;
    }

    setIsAgregando(true);
    try {
      const vehiculo = await ventaOrdenesService.resolverVehiculo({
        clientId: Number(clientId),
        plate: placa,
        capacity: capacidad,
        ...(esPrivado && { vehicleid: vehicleid.trim(), company }),
      });
      if (agregar(vehiculo)) {
        if (esPrivado) setInternos((prev) => [...prev, vehiculo as unknown as Vehicle]);
        limpiar();
      }
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo agregar el vehículo'));
    } finally {
      setIsAgregando(false);
    }
  };

  const mostrarCampos = !esPrivado || creandoInterno;
  // Un vehículo ya registrado no necesita ID ni empresa: ya los tiene.
  const pedirDatosInterno = esPrivado && !registrado;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-900 dark:text-night-text mb-2">Vehículos de la orden</p>

      {!clientId ? (
        <p className="text-xs text-gray-500 dark:text-night-muted bg-gray-50 dark:bg-night-raised border rounded-lg p-3">
          Elige primero el cliente.
        </p>
      ) : (
        <div className="space-y-2 bg-gray-50 dark:bg-night-raised border rounded-lg p-3">
          {esPrivado && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label="Vehículo de la empresa"
                  placeholder="Buscar por ID o placa"
                  options={internoOptions}
                  value=""
                  onChange={elegirInterno}
                  emptyMessage="No hay vehículos con ese ID o placa"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Plus size={14} />}
                onClick={() => {
                  setCreandoInterno((v) => !v);
                  limpiar();
                }}
              >
                {creandoInterno ? 'Cancelar nuevo' : 'Nuevo vehículo'}
              </Button>
            </div>
          )}

          {mostrarCampos && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-700 dark:text-night-text mb-1">Placa</label>
                <input
                  className={inputClass}
                  value={placa}
                  onChange={(e) => setPlaca(formatearPlaca(e.target.value))}
                  onKeyDown={bloquearEnter}
                  placeholder="ABC1234"
                  maxLength={7}
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-700 dark:text-night-text mb-1">m³</label>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  value={m3}
                  onChange={(e) => setM3(e.target.value)}
                  onKeyDown={bloquearEnter}
                  disabled={!!registrado}
                  placeholder="14"
                />
              </div>
              {pedirDatosInterno && (
                <>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-700 dark:text-night-text mb-1">ID</label>
                    <input
                      className={inputClass}
                      value={vehicleid}
                      onChange={(e) => setVehicleid(e.target.value.toUpperCase())}
                      onKeyDown={bloquearEnter}
                      placeholder="TCR-02-99"
                    />
                  </div>
                  <div className="w-40">
                    <label className="block text-xs font-medium text-gray-700 dark:text-night-text mb-1">Empresa</label>
                    <select
                      className={inputClass}
                      value={company}
                      onChange={(e) => setCompany(e.target.value as VehicleCompany)}
                    >
                      {Object.entries(VEHICLE_COMPANY_LABELS).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant="primary"
                icon={<Plus size={14} />}
                isLoading={isAgregando}
                disabled={buscando}
                onClick={() => void handleAgregar()}
              >
                Agregar
              </Button>
            </div>
          )}

          {mostrarCampos && registrado && (
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Ya registrado: {registrado.vehicleid} · {registrado.plate} · se usa su cubicaje de{' '}
              {registrado.capacity} m³.
            </p>
          )}
          {mostrarCampos && !registrado && !esPrivado && (
            <p className="text-xs text-gray-500 dark:text-night-muted">
              Cliente público: si la placa es nueva se registra como externo de su proveedor.
            </p>
          )}

          {value.length > 0 && (
            <table className="min-w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 dark:text-night-muted border-b">
                  <th className="py-1 pr-3">ID</th>
                  <th className="py-1 pr-3">Placa</th>
                  <th className="py-1 pr-3 text-right">m³</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {value.map((v) => (
                  <tr key={v.id}>
                    <td className="py-1 pr-3 font-mono text-xs">{v.vehicleid}</td>
                    <td className="py-1 pr-3">{v.plate}</td>
                    <td className="py-1 pr-3 text-right">{v.capacity}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => onChange(value.filter((x) => x.id !== v.id))}
                        className="text-gray-400 dark:text-night-subtle hover:text-red-600 p-1"
                        title="Quitar de la orden"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
