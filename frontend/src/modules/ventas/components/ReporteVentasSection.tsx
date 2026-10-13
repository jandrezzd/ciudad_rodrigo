import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  Layers,
  Package,
  Truck,
  Users,
} from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Pagination } from '@/shared/components/Pagination';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { formatDateTime } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { useClientes } from '@/modules/clientes';
import { Input } from '@/shared/components/Input';
import { ventasService } from '../services/ventasService';
import { VentaConsumoGrupo, VentaConsumoReport, VentaQr } from '../types';
import { idVehiculoVenta, placaVehiculoVenta } from '../utils/vehiculoVenta';

/** Hasta 3 decimales, sin ceros de relleno — mismo criterio que StockConsumoView. */
const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

/** Las tablas que van en pareja paginan de a pocas filas, porque comparten el
 *  ancho. Las que ocupan la fila entera —historial y consumo por cantera—
 *  muestran más, que es lo que justifica el espacio que se llevan. */
const FILAS_EN_PAREJA = 5;
const FILAS_ANCHO_COMPLETO = 10;

/**
 * Reporte de ventas de cantera: consumo y stock.
 *
 * Ojo a la mezcla de temporalidades: los totales de viajes y m³ vendidos, las
 * agrupaciones y el historial responden al rango de fechas filtrado, mientras
 * que el stock es **siempre el saldo actual**. Un "disponible" de hace tres
 * meses no sirve para decidir hoy, así que no se filtra por fecha y las tarjetas
 * lo dicen expresamente.
 */
export const ReporteVentasSection = () => {
  const [reporte, setReporte] = useState<VentaConsumoReport | null>(null);
  const [puntosDeVenta, setPuntosDeVenta] = useState<VentaQr[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [canteraId, setCanteraId] = useState('');
  const [compradorId, setCompradorId] = useState('');
  const [ordenId, setOrdenId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // Filtra el historial en pantalla, sin volver a consultar.
  const [codigoViaje, setCodigoViaje] = useState('');
  // Órdenes vistas en cualquier carga: tomarlas solo del reporte filtrado
  // dejaría el selector con una única opción al elegir una orden.
  const [ordenesConocidas, setOrdenesConocidas] = useState<Map<string, string>>(
    () => new Map()
  );

  const { clientes } = useClientes();

  // Una página por tabla: son independientes entre sí.
  const [pageHistorial, setPageHistorial] = useState(1);
  const [pageCantera, setPageCantera] = useState(1);
  const [pageMaterial, setPageMaterial] = useState(1);
  const [pageVehiculo, setPageVehiculo] = useState(1);
  const [pageComprador, setPageComprador] = useState(1);
  const [pageOrden, setPageOrden] = useState(1);
  const [pageTipo, setPageTipo] = useState(1);

  const cargar = async () => {
    try {
      setIsLoading(true);
      const data = await ventasService.getReporteConsumo({
        canteraId: canteraId ? Number(canteraId) : undefined,
        compradorId: compradorId ? Number(compradorId) : undefined,
        ordenId: ordenId ? Number(ordenId) : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setReporte(data);
      setOrdenesConocidas((prev) => {
        const next = new Map(prev);
        data.porOrden.forEach((o) => {
          if (o.id != null) next.set(String(o.id), o.etiqueta);
        });
        return next;
      });

      // El reporte nuevo puede tener menos filas que el anterior: sin esto, una
      // tabla quedaría en una página que ya no existe y se vería vacía.
      setPageHistorial(1);
      setPageCantera(1);
      setPageMaterial(1);
      setPageVehiculo(1);
      setPageComprador(1);
      setPageOrden(1);
      setPageTipo(1);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar el reporte de ventas');
      setReporte(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // Carga inicial sin filtros; los cambios se aplican con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La lista del filtro se carga una sola vez y no depende del reporte.
  useEffect(() => {
    let activo = true;
    ventasService
      .getQrs()
      .then((datos) => {
        if (activo) setPuntosDeVenta(datos);
      })
      .catch((error) => {
        console.error(error);
        if (activo) toast.error('No se pudieron cargar las canteras del filtro');
      });
    return () => {
      activo = false;
    };
  }, []);

  /** Las canteras salen del propio reporte: son las que efectivamente vendieron. */
  /**
   * Los puntos de venta, no las canteras del reporte.
   *
   * Antes las opciones salían de `reporte.porCantera`, que viene ya filtrado:
   * al elegir una cantera el reporte volvía solo con esa, el selector se
   * quedaba con una única opción y no había forma de volver atrás ni de cambiar
   * a otra. El filtro se destruía a sí mismo en cuanto se usaba.
   */
  const canteraOptions = useMemo(
    () => [
      { value: '', label: 'Todas las canteras' },
      ...puntosDeVenta
        .map((qr) => ({
          value: String(qr.canteraId),
          label: qr.cantera?.nombre ?? qr.qrcode,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [puntosDeVenta]
  );

  const clienteOptions = useMemo(
    () => [
      { value: '', label: 'Todos los clientes' },
      ...clientes
        .filter((c) => c.isActive)
        .map((c) => ({
          value: String(c.id),
          label: `${c.companyname || c.name}${c.ruc ? ` (${c.ruc})` : ''}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [clientes]
  );

  const ordenOptions = useMemo(
    () => [
      { value: '', label: 'Todas las órdenes' },
      ...[...ordenesConocidas.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => b.label.localeCompare(a.label)),
    ],
    [ordenesConocidas]
  );

  // Materiales sin stock asignado ahora mismo, por cantera, para marcar sus despachos.
  const materialesExcedidos = useMemo(() => {
    const set = new Set<string>();
    reporte?.stock?.canteras.forEach((cantera) => {
      cantera.materiales.forEach((m) => {
        if (m.excedido) set.add(`${cantera.id}:${m.materialId}`);
      });
    });
    return set;
  }, [reporte]);

  const historial = useMemo(() => {
    const movimientos = reporte?.movimientos ?? [];
    const needle = codigoViaje.trim().toLowerCase();
    if (!needle) return movimientos;
    return movimientos.filter((v) => (v.codigo ?? `#${v.id}`).toLowerCase().includes(needle));
  }, [reporte, codigoViaje]);

  const handleExcel = () => {
    if (!historial.length) {
      toast.error('No hay registros para exportar');
      return;
    }

    const exportData = historial.map((venta) => ({
      codigo: venta.codigo || `#${venta.id}`,
      fecha: formatDateTime(venta.capturedAt) || '—',
      cantera: venta.cantera?.nombre ?? '—',
      'id vehiculo': idVehiculoVenta(venta),
      placa: placaVehiculoVenta(venta),
      tipo: venta.vehicle?.type ?? '—',
      chofer: venta.driverName ?? '—',
      material: venta.material?.materialType
        ? formatMaterialType(venta.material.materialType)
        : '—',
      m3: venta.m3,
      comprador: venta.comprador ?? '—',
      orden: venta.orden?.codigo ?? 'SIN ORDEN',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consumo ventas');
    XLSX.writeFile(
      workbook,
      `consumo_ventas_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    toast.success('Excel generado correctamente');
  };

  /**
   * Tabla de consumo agrupado. Paginada en cliente: el endpoint devuelve el
   * reporte completo de una vez, y son agrupaciones —decenas de filas, no
   * miles—, así que no hace falta ir al servidor para pasar de página.
   */
  const renderGrupo = (
    titulo: string,
    icono: React.ReactNode,
    grupos: VentaConsumoGrupo[],
    etiquetaColumna: string,
    page: number,
    setPage: (page: number) => void,
    filasPorPagina: number = FILAS_EN_PAREJA,
    formatearEtiqueta: (grupo: VentaConsumoGrupo) => string = (g) => g.etiqueta
  ) => {
    const visibles = grupos.slice((page - 1) * filasPorPagina, page * filasPorPagina);

    return (
      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          {icono}
          <h3 className="font-semibold text-gray-900 dark:text-night-text">{titulo}</h3>
        </div>

        {!grupos.length && <p className="text-sm text-gray-500 dark:text-night-muted">Sin datos en el período.</p>}

        {grupos.length > 0 && (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 dark:text-night-muted border-b">
                    <th className="py-2 pr-4">{etiquetaColumna}</th>
                    <th className="py-2 pr-4 text-right">Viajes</th>
                    <th className="py-2 text-right">M³</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibles.map((grupo) => (
                    <tr key={`${etiquetaColumna}-${grupo.id}`}>
                      <td className="py-2 pr-4 text-gray-900 dark:text-night-text">{formatearEtiqueta(grupo)}</td>
                      <td className="py-2 pr-4 text-right text-gray-600 dark:text-night-muted">{grupo.viajes}</td>
                      <td className="py-2 text-right font-semibold text-gray-900 dark:text-night-text">
                        {formatCantidad(grupo.m3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {grupos.length > filasPorPagina && (
              <Pagination
                page={page}
                pageSize={filasPorPagina}
                total={grupos.length}
                onPageChange={setPage}
                className="mt-4"
              />
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-night-text">Consumo por ventas</h2>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
          icon={<Download size={16} />}
          onClick={handleExcel}
        >
          Exportar Excel
        </Button>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <SearchableSelect
            label="Cantera"
            placeholder="Todas las canteras"
            options={canteraOptions}
            value={canteraId}
            onChange={setCanteraId}
            emptyMessage="No hay canteras con ese nombre"
          />
          <SearchableSelect
            label="Cliente"
            placeholder="Todos los clientes"
            options={clienteOptions}
            value={compradorId}
            onChange={setCompradorId}
            emptyMessage="No hay clientes con ese nombre"
          />
          <SearchableSelect
            label="Orden"
            placeholder="Todas las órdenes"
            options={ordenOptions}
            value={ordenId}
            onChange={setOrdenId}
            emptyMessage="No hay órdenes con ese código"
          />
          <Input
            label="Código de viaje"
            placeholder="Ej: VEN-00012"
            value={codigoViaje}
            onChange={(e) => {
              setCodigoViaje(e.target.value);
              setPageHistorial(1);
            }}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-night-text mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-night-border focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-night-text mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-night-border focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button variant="primary" onClick={cargar} isLoading={isLoading}>
            Generar reporte
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-night-muted mt-2">
          Las fechas filtran por la hora real del despacho, no por la de sincronización.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      )}

      {!isLoading && reporte && (
        <>
          {/* Los dos primeros son del período filtrado; los dos de stock son el
              saldo actual, y por eso llevan la aclaración. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
              <p className="text-xs uppercase text-gray-500 dark:text-night-muted">Viajes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-night-text mt-1 tabular-nums">
                {reporte.totales.viajes}
              </p>
            </div>
            <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
              <p className="text-xs uppercase text-gray-500 dark:text-night-muted">M³ vendidos</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {formatCantidad(reporte.totales.m3)}
              </p>
            </div>
            <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
              <p className="text-xs uppercase text-gray-500 dark:text-night-muted">Stock asignado</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-night-text mt-1 tabular-nums">
                {formatCantidad(reporte.stock?.totales.asignadoM3)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-night-subtle mt-1">saldo actual</p>
            </div>
            <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
              <p className="text-xs uppercase text-gray-500 dark:text-night-muted">Disponible</p>
              <p
                className={`text-2xl font-bold mt-1 tabular-nums ${
                  (reporte.stock?.totales.disponibleM3 ?? 0) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-700 dark:text-green-300'
                }`}
              >
                {formatCantidad(reporte.stock?.totales.disponibleM3)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-night-subtle mt-1">saldo actual</p>
            </div>
          </div>

          {/* Stock por cantera y material */}
          <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} className="text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-semibold text-gray-900 dark:text-night-text">Stock por cantera</h3>
              <span className="text-xs text-gray-400 dark:text-night-subtle">
                (saldo actual, no depende del rango de fechas)
              </span>
            </div>

            {!reporte.stock?.canteras.length && (
              <p className="text-sm text-gray-500 dark:text-night-muted">
                Ninguna cantera tiene stock cargado todavía. Se carga desde
                Ventas → Venta de material → Stock.
              </p>
            )}

            {reporte.stock?.canteras.map((cantera) => (
              <div key={cantera.id} className="mb-5 last:mb-0">
                <p className="font-medium text-gray-900 dark:text-night-text text-sm mb-2">
                  {cantera.nombre ?? '—'}
                  {cantera.materialProvider?.razonsocial && (
                    <span className="text-gray-400 dark:text-night-subtle font-normal">
                      {' '}
                      · {cantera.materialProvider.razonsocial}
                    </span>
                  )}
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-gray-500 dark:text-night-muted border-b">
                        <th className="py-2 pr-4">Material</th>
                        <th className="py-2 pr-4 text-right">Asignado M³</th>
                        <th className="py-2 pr-4 text-right">Vendido M³</th>
                        <th className="py-2 text-right">Disponible M³</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cantera.materiales.map((m) => (
                        <tr key={m.id} className={m.excedido ? 'bg-red-50 dark:bg-red-500/10' : undefined}>
                          <td className="py-2 pr-4 text-gray-900 dark:text-night-text">
                            <div className="flex items-center gap-2">
                              {m.material
                                ? formatMaterialType(m.material.materialType)
                                : '—'}
                              {m.excedido && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/15 px-2 py-0.5 rounded-full">
                                  <AlertTriangle size={10} />
                                  Excedido
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-right text-gray-600 dark:text-night-muted tabular-nums">
                            {formatCantidad(m.asignadoM3)}
                          </td>
                          <td className="py-2 pr-4 text-right text-blue-600 dark:text-blue-400 tabular-nums">
                            {formatCantidad(m.consumidoM3)}
                          </td>
                          <td
                            className={`py-2 text-right font-semibold tabular-nums ${
                              m.disponibleM3 < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-300'
                            }`}
                          >
                            {formatCantidad(m.disponibleM3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* El historial va primero: es el detalle que se consulta, y los
              consumos de abajo son su resumen. */}
          <div className="bg-white dark:bg-night-surface rounded-lg shadow p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} className="text-gray-700 dark:text-night-text" />
              <h3 className="font-semibold text-gray-900 dark:text-night-text">Historial de despachos</h3>
            </div>

            {!historial.length && (
              <p className="text-sm text-gray-500 dark:text-night-muted">
                {codigoViaje.trim()
                  ? 'Ningún despacho coincide con ese código de viaje.'
                  : 'Sin despachos en el período.'}
              </p>
            )}

            {historial.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-gray-500 dark:text-night-muted border-b">
                        <th className="py-2 pr-4">Código</th>
                        <th className="py-2 pr-4">Fecha</th>
                        <th className="py-2 pr-4">Cantera</th>
                        <th className="py-2 pr-4">Vehículo</th>
                        <th className="py-2 pr-4">Chofer</th>
                        <th className="py-2 pr-4">Material</th>
                        <th className="py-2 pr-4">Comprador</th>
                        <th className="py-2 pr-4">Orden</th>
                        <th className="py-2 text-right">M³</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historial
                        .slice(
                          (pageHistorial - 1) * FILAS_ANCHO_COMPLETO,
                          pageHistorial * FILAS_ANCHO_COMPLETO
                        )
                        .map((venta) => (
                          <tr
                            key={venta.id}
                            className={
                              materialesExcedidos.has(`${venta.canteraId}:${venta.materialId}`)
                                ? 'bg-red-50 dark:bg-red-500/10'
                                : undefined
                            }
                          >
                            <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-night-text whitespace-nowrap">
                              {venta.codigo || `#${venta.id}`}
                            </td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-night-muted whitespace-nowrap">
                              {formatDateTime(venta.capturedAt)}
                            </td>
                            <td className="py-2 pr-4 text-gray-900 dark:text-night-text">
                              {venta.cantera?.nombre ?? '—'}
                            </td>
                            <td className="py-2 pr-4 text-gray-900 dark:text-night-text">
                              {idVehiculoVenta(venta)} ({placaVehiculoVenta(venta)})
                            </td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-night-muted">
                              {venta.driverName ?? '—'}
                            </td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-night-muted">
                              {venta.material?.materialType
                                ? formatMaterialType(venta.material.materialType)
                                : '—'}
                            </td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-night-muted">
                              {venta.comprador ?? '—'}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap">
                              <span
                                className={
                                  venta.orden ? 'text-gray-900 dark:text-night-text font-medium' : 'text-gray-400 dark:text-night-subtle italic'
                                }
                              >
                                {venta.orden?.codigo ?? 'Sin orden'}
                              </span>
                            </td>
                            <td className="py-2 text-right font-semibold text-gray-900 dark:text-night-text">
                              {formatCantidad(venta.m3)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {historial.length > FILAS_ANCHO_COMPLETO && (
                  <Pagination
                    page={pageHistorial}
                    pageSize={FILAS_ANCHO_COMPLETO}
                    total={historial.length}
                    onPageChange={setPageHistorial}
                    className="mt-4"
                  />
                )}
              </>
            )}
          </div>

          {/* Cantera va sola y a lo ancho: es la agrupación de mayor nivel, y
              debajo se abre en el detalle por vehículo y por material. */}
          {renderGrupo(
            'Consumo por cantera',
            <Layers size={18} className="text-emerald-600 dark:text-emerald-400" />,
            reporte.porCantera,
            'Cantera',
            pageCantera,
            setPageCantera,
            FILAS_ANCHO_COMPLETO
          )}

          {/* Cuánto se despachó contra cada orden de venta. Las ventas sin
              orden (todavía la mayoría, hasta que la app la mande siempre)
              no forman parte de este grupo. */}
          {renderGrupo(
            'Consumo por orden de venta',
            <ClipboardList size={18} className="text-purple-600 dark:text-purple-400" />,
            reporte.porOrden ?? [],
            'Orden',
            pageOrden,
            setPageOrden,
            FILAS_ANCHO_COMPLETO
          )}

          {/* `items-start` evita que la tabla más corta se estire para igualar
              la altura de la de al lado. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {renderGrupo(
              'Vehículos que despacharon',
              <Truck size={18} className="text-indigo-600 dark:text-indigo-400" />,
              reporte.porVehiculo,
              'Vehículo',
              pageVehiculo,
              setPageVehiculo
            )}

            {renderGrupo(
              'Consumo por material',
              <Package size={18} className="text-blue-600 dark:text-blue-400" />,
              reporte.porMaterial,
              'Material',
              pageMaterial,
              setPageMaterial,
              FILAS_EN_PAREJA,
              (grupo) => formatMaterialType(grupo.etiqueta)
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* A quién se le vendió. Con el comprador como texto libre esto no
                se podía calcular: el mismo cliente escrito de tres formas
                aparecía como tres compradores distintos. */}
            {renderGrupo(
              'Ventas por comprador',
              <Users size={18} className="text-yellow-600 dark:text-yellow-400" />,
              reporte.porComprador ?? [],
              'Cliente',
              pageComprador,
              setPageComprador
            )}

            {/* Interna (PRIVADO, obra propia) vs Externa (PUBLICO, cliente de
                afuera) — mismo criterio que ya distingue esto en el resto del
                sistema. */}
            {renderGrupo(
              'Interna vs Externa',
              <Users size={18} className="text-orange-600 dark:text-orange-400" />,
              reporte.porTipoCliente ?? [],
              'Tipo',
              pageTipo,
              setPageTipo
            )}
          </div>
        </>
      )}
    </div>
  );
};
