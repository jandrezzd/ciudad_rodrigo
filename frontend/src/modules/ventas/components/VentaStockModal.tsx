import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, History, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { formatDateTime } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import { ventasService } from '../services/ventasService';
import { VentaQr, VentaStockCantera, VentaStockMovimiento } from '../types';

interface VentaStockPanelProps {
  canteraId: number;
  canteraNombre?: string | null;
}

/** Mismo criterio que StockConsumoView: hasta 3 decimales, sin ceros de relleno. */
const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

const TIPO_LABELS: Record<string, string> = {
  INGRESO: 'Ingreso',
  SALIDA: 'Venta',
  AJUSTE: 'Ajuste',
  REVERSA: 'Anulada',
};

const TIPO_STYLES: Record<string, string> = {
  INGRESO: 'bg-green-100 text-green-700',
  SALIDA: 'bg-blue-100 text-blue-700',
  AJUSTE: 'bg-amber-100 text-amber-700',
  REVERSA: 'bg-gray-100 text-gray-600',
};

/**
 * Gestión del stock de una cantera de venta: cuánto material tiene asignado,
 * cuánto se ha vendido y cuánto queda, más la carga de material nuevo.
 *
 * El asignado nunca se edita a ciegas: todo cambio deja su movimiento en el
 * libro mayor, así que el número y su historia siempre cuadran.
 */
const VentaStockPanel = ({ canteraId, canteraNombre }: VentaStockPanelProps) => {
  const { materiales } = useMateriales();

  const [stock, setStock] = useState<VentaStockCantera | null>(null);
  const [movimientos, setMovimientos] = useState<VentaStockMovimiento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  // Alta de ingreso
  const [materialId, setMaterialId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const cargar = async () => {
    try {
      setIsLoading(true);
      const [datosStock, datosMovimientos] = await Promise.all([
        ventasService.getStockCantera(canteraId),
        ventasService.getMovimientosStock(canteraId),
      ]);
      setStock(datosStock);
      setMovimientos(datosMovimientos);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar el stock de la cantera');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canteraId]);

  const materialOptions = useMemo(
    () =>
      materiales.map((m) => ({
        value: String(m.id),
        label: formatMaterialType(m.materialType),
      })),
    [materiales]
  );

  const totales = useMemo(() => {
    const filas = stock?.materiales ?? [];
    return filas.reduce(
      (acc, m) => ({
        asignado: acc.asignado + m.asignadoM3,
        consumido: acc.consumido + m.consumidoM3,
        disponible: acc.disponible + m.disponibleM3,
      }),
      { asignado: 0, consumido: 0, disponible: 0 }
    );
  }, [stock]);

  const handleIngreso = async () => {
    const m3 = Number(cantidad);
    if (!materialId) {
      toast.error('Elija el material');
      return;
    }
    if (!Number.isFinite(m3) || m3 <= 0) {
      toast.error('La cantidad debe ser mayor a cero');
      return;
    }

    try {
      setIsSaving(true);
      await ventasService.registrarIngreso({
        canteraId,
        materialId: Number(materialId),
        m3,
        motivo: motivo.trim() || undefined,
      });
      toast.success('Ingreso registrado');
      setMaterialId('');
      setCantidad('');
      setMotivo('');
      await cargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo registrar el ingreso');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetirar = async (stockId: number, nombre: string) => {
    if (!window.confirm(`¿Retirar ${nombre} de este punto de venta?`)) return;
    try {
      await ventasService.retirarStock(stockId);
      toast.success('Material retirado');
      await cargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo retirar el material');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
        El stock de <strong>{canteraNombre ?? 'esta cantera'}</strong> se descuenta con
        cada venta que llega desde la app. Si una venta supera lo disponible se registra
        igual y el saldo queda en rojo: el camión ya cargó, y esconder el dato no lo
        devuelve.
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs uppercase text-gray-500">Asignado</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {formatCantidad(totales.asignado)} m³
          </p>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs uppercase text-gray-500">Vendido</p>
          <p className="text-xl font-bold text-blue-600 tabular-nums">
            {formatCantidad(totales.consumido)} m³
          </p>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs uppercase text-gray-500">Disponible</p>
          <p
            className={`text-xl font-bold tabular-nums ${
              totales.disponible < 0 ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {formatCantidad(totales.disponible)} m³
          </p>
        </div>
      </div>

      {/* Ingreso de material */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={16} className="text-green-600" />
          <h4 className="font-semibold text-gray-900 text-sm">Cargar material</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <SearchableSelect
            label="Material"
            placeholder="Elija el material"
            options={materialOptions}
            value={materialId}
            onChange={setMaterialId}
          />
          <Input
            label="Metros cúbicos"
            type="number"
            step="0.001"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej: 500"
          />
          <Input
            label="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Ingreso de producción"
          />
          <Button variant="primary" onClick={handleIngreso} isLoading={isSaving}>
            Registrar ingreso
          </Button>
        </div>
      </div>

      {/* Stock por material */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-gray-700" />
            <h4 className="font-semibold text-gray-900 text-sm">Stock por material</h4>
          </div>
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <History size={14} />
            {verHistorial ? 'Ocultar movimientos' : 'Ver movimientos'}
          </button>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Cargando...</p>}

        {!isLoading && !stock?.materiales.length && (
          <p className="text-sm text-gray-500 border border-dashed rounded-lg p-4 text-center">
            Esta cantera todavía no tiene material cargado. Use "Cargar material" para
            asignarle stock.
          </p>
        )}

        {!isLoading && !!stock?.materiales.length && (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-2 px-3">Material</th>
                  <th className="py-2 px-3 text-right">Asignado m³</th>
                  <th className="py-2 px-3 text-right">Vendido m³</th>
                  <th className="py-2 px-3 text-right">Disponible m³</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {stock.materiales.map((m) => (
                  <tr key={m.id} className={m.excedido ? 'bg-red-50' : undefined}>
                    <td className="py-2 px-3 text-gray-900">
                      <div className="flex items-center gap-2">
                        {m.material ? formatMaterialType(m.material.materialType) : '—'}
                        {m.excedido && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={10} />
                            Excedido
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
                      {formatCantidad(m.asignadoM3)}
                    </td>
                    <td className="py-2 px-3 text-right text-blue-600 tabular-nums">
                      {formatCantidad(m.consumidoM3)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold tabular-nums ${
                        m.disponibleM3 < 0 ? 'text-red-600' : 'text-green-700'
                      }`}
                    >
                      {formatCantidad(m.disponibleM3)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          handleRetirar(
                            m.id,
                            m.material ? formatMaterialType(m.material.materialType) : 'el material'
                          )
                        }
                        className="text-gray-400 hover:text-red-600"
                        title="Retirar del punto de venta"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Libro mayor */}
      {verHistorial && (
        <div>
          <h4 className="font-semibold text-gray-900 text-sm mb-2">Movimientos</h4>
          {!movimientos.length && (
            <p className="text-sm text-gray-500">Sin movimientos registrados.</p>
          )}
          {!!movimientos.length && (
            <div className="overflow-x-auto border rounded-lg max-h-72 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-2 px-3">Fecha</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Material</th>
                    <th className="py-2 px-3">Detalle</th>
                    <th className="py-2 px-3 text-right">m³</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movimientos.map((mov) => (
                    <tr key={mov.id}>
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(mov.capturedAt)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            TIPO_STYLES[mov.tipo] ?? 'bg-gray-100 text-gray-600'
                          }`}
                          title={mov.motivo ?? undefined}
                        >
                          {TIPO_LABELS[mov.tipo] ?? mov.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {mov.stock?.material
                          ? formatMaterialType(mov.stock.material.materialType)
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {mov.venta
                          ? `${mov.venta.plate ?? mov.venta.vehicleIdText}${
                              mov.venta.comprador ? ` · ${mov.venta.comprador}` : ''
                            }`
                          : mov.motivo || (mov.user ? `Por ${mov.user.name}` : '—')}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-gray-900">
                        {formatCantidad(mov.m3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Contenedor del modal: elige el punto de venta y muestra su stock.
 *
 * Las canteras salen de los QR activos, no del catálogo de canteras: solo las
 * que son punto de venta pueden recibir ventas, así que solo ellas necesitan
 * stock de venta.
 */
export const VentaStockModal = () => {
  const [qrs, setQrs] = useState<VentaQr[]>([]);
  const [canteraId, setCanteraId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        setIsLoading(true);
        const datos = await ventasService.getQrs();
        if (!activo) return;
        setQrs(datos);
        // Con un solo punto de venta, elegirlo a mano es un paso de más.
        if (datos.length === 1) setCanteraId(String(datos[0].canteraId));
      } catch (error) {
        console.error(error);
        if (activo) toast.error('No se pudieron cargar los puntos de venta');
      } finally {
        if (activo) setIsLoading(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const opciones = useMemo(
    () =>
      qrs
        .map((qr) => ({
          value: String(qr.canteraId),
          label: `${qr.cantera?.nombre ?? qr.qrcode}${
            qr.cantera?.materialProvider?.razonsocial
              ? ` — ${qr.cantera.materialProvider.razonsocial}`
              : ''
          }`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [qrs]
  );

  const seleccionada = qrs.find((qr) => String(qr.canteraId) === canteraId);

  return (
    <div className="space-y-5">
      <SearchableSelect
        label="Punto de venta"
        placeholder={isLoading ? 'Cargando...' : 'Elija la cantera'}
        options={opciones}
        value={canteraId}
        onChange={setCanteraId}
        emptyMessage="No hay canteras con QR de venta activo"
      />

      {!canteraId && !isLoading && (
        <p className="text-sm text-gray-500 border border-dashed rounded-lg p-6 text-center">
          Elija una cantera para ver y cargar su stock.
        </p>
      )}

      {canteraId && (
        <VentaStockPanel
          key={canteraId}
          canteraId={Number(canteraId)}
          canteraNombre={seleccionada?.cantera?.nombre}
        />
      )}
    </div>
  );
};
