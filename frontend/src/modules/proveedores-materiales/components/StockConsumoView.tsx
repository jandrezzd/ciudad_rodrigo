import { useEffect, useMemo, useState } from 'react';
import {
  Package,
  Truck,
  AlertTriangle,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { proveedorMaterialService } from '../services/proveedorMaterialService';
import { useProveedoresMateriales } from '../hooks/useProveedoresMateriales';
import {
  HistorialProveedor,
  PROVEEDOR_MATERIAL_TIPO_LABELS,
} from '../types';

/** Hasta 3 decimales, sin ceros de relleno */
const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

const formatFecha = (iso?: string | null) => {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-EC');
};

/** Barra de consumo: proporción gastada del stock asignado */
const BarraConsumo = ({ asignado, consumido }: { asignado: number; consumido: number }) => {
  if (asignado <= 0) return null;
  const porcentaje = Math.min(100, (consumido / asignado) * 100);
  const excedido = consumido > asignado;

  return (
    <div className="mt-1">
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            excedido ? 'bg-red-500' : porcentaje > 80 ? 'bg-amber-500' : 'bg-green-500'
          }`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400">{porcentaje.toFixed(1)}% consumido</span>
    </div>
  );
};

/**
 * Stock y consumo de los proveedores de material, en la vista principal.
 *
 * Los saldos salen del libro mayor: cada despacho registrado descuenta del
 * stock de su cantera. Un mismo proveedor puede alimentar varias
 * planificaciones, así que el disponible refleja todas juntas.
 */
export const StockConsumoView = () => {
  const { proveedores, isLoading } = useProveedoresMateriales();
  const [proveedorId, setProveedorId] = useState('');
  const [canteraId, setCanteraId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [historial, setHistorial] = useState<HistorialProveedor | null>(null);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehiculoExpandido, setVehiculoExpandido] = useState<number | null>(null);

  const proveedorSeleccionado = useMemo(
    () => proveedores.find((p) => String(p.id) === proveedorId),
    [proveedores, proveedorId],
  );

  // El primer proveedor se selecciona solo para que la vista no arranque vacía
  useEffect(() => {
    if (!proveedorId && proveedores.length > 0) {
      setProveedorId(String(proveedores[0].id));
    }
  }, [proveedores, proveedorId]);

  useEffect(() => {
    setCanteraId('');
  }, [proveedorId]);

  useEffect(() => {
    if (!proveedorId) return;

    let activo = true;
    setIsLoadingHistorial(true);
    setError(null);

    proveedorMaterialService
      .getHistorial(Number(proveedorId), {
        canteraId: canteraId ? Number(canteraId) : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      })
      .then((data) => {
        if (activo) setHistorial(data);
      })
      .catch((err) => {
        console.error(err);
        if (activo) setError('No se pudo cargar el historial de despachos');
      })
      .finally(() => {
        if (activo) setIsLoadingHistorial(false);
      });

    return () => {
      activo = false;
    };
  }, [proveedorId, canteraId, desde, hasta]);

  const canterasVisibles = useMemo(() => {
    const canteras = proveedorSeleccionado?.canteras ?? [];
    return canteraId ? canteras.filter((c) => String(c.id) === canteraId) : canteras;
  }, [proveedorSeleccionado, canteraId]);

  const totalesStock = useMemo(
    () =>
      canterasVisibles
        .flatMap((c) => c.materiales ?? [])
        .reduce(
          (acc, m) => ({
            asignadoM3: acc.asignadoM3 + (m.metrosCubicos ?? 0),
            consumidoM3: acc.consumidoM3 + (m.consumidoM3 ?? 0),
            disponibleM3: acc.disponibleM3 + (m.disponibleM3 ?? 0),
            asignadoTn: acc.asignadoTn + (m.toneladas ?? 0),
            consumidoTn: acc.consumidoTn + (m.consumidoToneladas ?? 0),
            disponibleTn: acc.disponibleTn + (m.disponibleToneladas ?? 0),
          }),
          {
            asignadoM3: 0,
            consumidoM3: 0,
            disponibleM3: 0,
            asignadoTn: 0,
            consumidoTn: 0,
            disponibleTn: 0,
          },
        ),
    [canterasVisibles],
  );

  const proveedorOptions = proveedores.map((p) => ({
    value: String(p.id),
    label: `${p.ruc} — ${p.nombreComercial || p.razonsocial} (${
      PROVEEDOR_MATERIAL_TIPO_LABELS[p.tipo] ?? '—'
    })`,
  }));

  // Un mismo proveedor puede tener dos canteras con igual nombre; el cantón las
  // diferencia sin ensuciar el caso normal.
  const canteraOptions = useMemo(() => {
    const canteras = proveedorSeleccionado?.canteras ?? [];
    const repetidos = new Set(
      canteras.map((c) => c.nombre).filter((n, i, todos) => todos.indexOf(n) !== i),
    );
    return [
      { value: '', label: 'Todas las canteras' },
      ...canteras.map((c) => ({
        value: String(c.id),
        label:
          repetidos.has(c.nombre) && (c.canton || c.provincia)
            ? `${c.nombre} — ${c.canton || c.provincia}`
            : c.nombre,
      })),
    ];
  }, [proveedorSeleccionado]);

  if (isLoading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Cargando proveedores...</p>;
  }

  if (proveedores.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-xl border-2 border-dashed border-gray-300">
        <p className="text-gray-500">No hay proveedores de material registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <SearchableSelect
              value={proveedorId}
              onChange={setProveedorId}
              options={proveedorOptions}
              placeholder="Seleccionar proveedor..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cantera</label>
            <SearchableSelect
              value={canteraId}
              onChange={setCanteraId}
              options={canteraOptions}
              placeholder="Todas las canteras"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Las fechas filtran el historial de despachos. El stock siempre muestra el saldo actual.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-1">Stock Asignado</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatCantidad(totalesStock.asignadoM3)} <span className="text-sm font-normal text-gray-400">M³</span>
          </p>
          <p className="text-xs text-gray-500 tabular-nums">
            {formatCantidad(totalesStock.asignadoTn)} TN
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-1">Consumido</p>
          <p className="text-2xl font-bold text-blue-600 tabular-nums">
            {formatCantidad(totalesStock.consumidoM3)} <span className="text-sm font-normal text-gray-400">M³</span>
          </p>
          <p className="text-xs text-gray-500 tabular-nums">
            {formatCantidad(totalesStock.consumidoTn)} TN
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-1">Disponible</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              totalesStock.disponibleM3 < 0 ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {formatCantidad(totalesStock.disponibleM3)} <span className="text-sm font-normal text-gray-400">M³</span>
          </p>
          <p className="text-xs text-gray-500 tabular-nums">
            {formatCantidad(totalesStock.disponibleTn)} TN
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Viajes</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {historial?.totales.viajes ?? 0}
            </p>
          </div>
          <Truck className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <Layers className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">Stock por Cantera</h3>
          {proveedorSeleccionado && (
            <>
              <span className="text-sm text-gray-500">
                {proveedorSeleccionado.nombreComercial || proveedorSeleccionado.razonsocial}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  proveedorSeleccionado.tipo === 'INTERNO'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {PROVEEDOR_MATERIAL_TIPO_LABELS[proveedorSeleccionado.tipo] ?? '—'}
              </span>
            </>
          )}
        </div>

        {canterasVisibles.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">
            Este proveedor no tiene canteras registradas.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {canterasVisibles.map((cantera) => (
              <div key={cantera.id} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-medium text-gray-900">{cantera.nombre}</h4>
                  <span className="text-xs text-gray-400">
                    {cantera.canton || '—'}, {cantera.provincia || '—'}
                  </span>
                </div>

                {(cantera.materiales ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">Sin materiales cargados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="text-left font-medium pb-2">Material</th>
                          <th className="text-right font-medium pb-2 px-3">Asignado M³</th>
                          <th className="text-right font-medium pb-2 px-3">Consumido M³</th>
                          <th className="text-right font-medium pb-2 px-3">Disponible M³</th>
                          <th className="text-right font-medium pb-2 px-3">Disponible TN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {cantera.materiales!.map((m) => (
                          <tr key={m.materialId} className={m.excedido ? 'bg-red-50' : undefined}>
                            <td className="py-2 pr-3 text-sm text-gray-900 align-top">
                              <div className="font-medium">
                                {m.material?.materialType
                                  ? formatMaterialType(m.material.materialType)
                                  : `Material #${m.materialId}`}
                                {m.excedido && (
                                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                                    <AlertTriangle className="w-3 h-3" />
                                    Excedido
                                  </span>
                                )}
                              </div>
                              <BarraConsumo
                                asignado={m.metrosCubicos ?? 0}
                                consumido={m.consumidoM3 ?? 0}
                              />
                            </td>
                            <td className="py-2 px-3 text-sm text-gray-600 text-right tabular-nums align-top">
                              {formatCantidad(m.metrosCubicos)}
                            </td>
                            <td className="py-2 px-3 text-sm text-blue-600 text-right tabular-nums align-top">
                              {formatCantidad(m.consumidoM3)}
                            </td>
                            <td
                              className={`py-2 px-3 text-sm text-right tabular-nums font-medium align-top ${
                                (m.disponibleM3 ?? 0) < 0 ? 'text-red-600' : 'text-green-700'
                              }`}
                            >
                              {formatCantidad(m.disponibleM3)}
                            </td>
                            <td
                              className={`py-2 px-3 text-sm text-right tabular-nums font-medium align-top ${
                                (m.disponibleToneladas ?? 0) < 0 ? 'text-red-600' : 'text-green-700'
                              }`}
                            >
                              {formatCantidad(m.disponibleToneladas)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Truck className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">Vehículos que despacharon</h3>
        </div>

        {isLoadingHistorial ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">Cargando...</p>
        ) : error ? (
          <p className="text-sm text-red-600 px-5 py-6 text-center">{error}</p>
        ) : (historial?.vehiculos.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">
            Todavía no hay despachos registrados para este proveedor.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {historial!.vehiculos.map((v) => {
              const expandido = vehiculoExpandido === v.vehicleId;
              return (
                <div key={v.vehicleId}>
                  <button
                    type="button"
                    onClick={() => setVehiculoExpandido(expandido ? null : v.vehicleId)}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{v.plate}</span>
                        <span className="text-xs text-gray-400">{v.vehicleid}</span>
                        {v.tuvoCambioDeConductor && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                            <UserCheck className="w-3 h-3" />
                            Cambió de conductor
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.marca} {v.modelo} · {v.empresa || 'Sin empresa'} ·{' '}
                        {v.conductores.map((c) => c.name || 'Sin nombre').join(', ') || 'Sin conductor'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatCantidad(v.totalM3)} M³
                        </p>
                        <p className="text-xs text-gray-500">{v.viajes} viajes</p>
                      </div>
                      {expandido ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {expandido && (
                    <div className="px-5 pb-4 bg-gray-50">
                      <p className="text-xs font-medium text-gray-500 uppercase py-2">
                        Conductores de este vehículo
                      </p>
                      <div className="space-y-1">
                        {v.conductores.length === 0 ? (
                          <p className="text-sm text-gray-500">Sin conductor registrado.</p>
                        ) : (
                          v.conductores.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200"
                            >
                              <div>
                                <p className="text-sm text-gray-900">{c.name || 'Sin nombre'}</p>
                                <p className="text-xs text-gray-500">
                                  {c.document || 'Sin cédula'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-900 tabular-nums">
                                  {formatCantidad(c.totalM3)} M³
                                </p>
                                <p className="text-xs text-gray-500">{c.viajes} viajes</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">Historial de despachos</h3>
          {historial && (
            <span className="ml-auto text-sm text-gray-500 tabular-nums">
              {formatCantidad(historial.totales.m3)} M³ · {formatCantidad(historial.totales.toneladas)} TN
            </span>
          )}
        </div>

        {isLoadingHistorial ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">Cargando despachos...</p>
        ) : (historial?.movimientos.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">
            No hay despachos en el período seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cantera</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vehículo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Conductor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Planificación</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Obra</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">M³</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">TN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historial!.movimientos.map((mov) => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                      {formatFecha(mov.capturedAt)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {mov.canteraMaterial?.cantera?.nombre || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {formatMaterialType(mov.canteraMaterial?.material?.materialType)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                      {mov.trip?.vehicle?.plate || '—'}
                      {mov.trip?.vehicle?.vehicleid && (
                        <span className="block text-[10px] text-gray-400">
                          {mov.trip.vehicle.vehicleid}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                      {mov.conductorViaje?.name || 'Sin registrar'}
                      {mov.cambioDeConductor && (
                        <span
                          className="block text-[10px] text-amber-600"
                          title={`Hoy el vehículo tiene asignado a ${mov.conductorActual?.name || 'otro conductor'}`}
                        >
                          hoy: {mov.conductorActual?.name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                      {mov.trip?.planning?.planningCode || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {mov.trip?.constSite?.name || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right tabular-nums font-medium">
                      {formatCantidad(mov.m3)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 text-right tabular-nums">
                      {formatCantidad(mov.toneladas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        El consumo se descuenta al registrar la salida desde la cantera y se ordena por el momento
        real del despacho, no por el de sincronización. Un viaje registrado sin conexión aparece
        con su fecha original cuando el dispositivo sincroniza.
      </p>
    </div>
  );
};
