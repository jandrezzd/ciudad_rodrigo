import { useEffect, useState } from 'react';
import { Package, TruckIcon, AlertTriangle } from 'lucide-react';
import { planificacionService } from '../services/planificacionService';
import { ConsumoMaterialPlanificacion } from '../types';

interface ConsumoMaterialPanelProps {
  planificacionId: string;
}

/** Hasta 3 decimales, sin ceros de relleno */
const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

/**
 * Material despachado en esta planificación, cruzado contra el stock de cada
 * cantera. Los datos salen del libro mayor, así que reflejan los viajes ya
 * sincronizados: lo que se registró sin conexión aparece al sincronizar.
 */
export const ConsumoMaterialPanel = ({ planificacionId }: ConsumoMaterialPanelProps) => {
  const [consumo, setConsumo] = useState<ConsumoMaterialPlanificacion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setIsLoading(true);
    setError(null);

    planificacionService
      .getConsumoMaterial(planificacionId)
      .then((data) => {
        if (activo) setConsumo(data);
      })
      .catch((err) => {
        console.error(err);
        if (activo) setError('No se pudo cargar el consumo de material');
      })
      .finally(() => {
        if (activo) setIsLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [planificacionId]);

  if (isLoading) {
    return <p className="text-sm text-gray-500 py-4">Cargando consumo de material...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }

  if (!consumo || consumo.canteras.length === 0) {
    return (
      <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-sm text-gray-500">
          Esta planificación no tiene canteras asignadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Despachado (M³)</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatCantidad(consumo.totales.consumidoM3)}
            </p>
          </div>
          <Package className="w-7 h-7 text-blue-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Despachado (TN)</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatCantidad(consumo.totales.consumidoToneladas)}
            </p>
          </div>
          <Package className="w-7 h-7 text-orange-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Viajes</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {consumo.totales.viajes}
            </p>
          </div>
          <TruckIcon className="w-7 h-7 text-green-500" />
        </div>
      </div>

      {consumo.canteras.map((cantera) => (
        <div key={cantera.canteraId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-900">{cantera.nombre}</h4>
            {cantera.materialProvider && (
              <p className="text-xs text-gray-500">
                {cantera.materialProvider.nombreComercial || cantera.materialProvider.razonsocial}
                {' · '}
                {cantera.materialProvider.ruc}
              </p>
            )}
          </div>

          {cantera.materiales.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-3">
              Esta cantera no tiene materiales cargados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Material
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Asignado M³
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Esta planificación
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Consumo total
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Disponible M³
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Viajes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cantera.materiales.map((m) => (
                    <tr key={m.canteraMaterialId} className={m.excedido ? 'bg-red-50' : undefined}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {m.material?.materialType || `Material #${m.materialId}`}
                        {m.excedido && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            Excedido
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right tabular-nums">
                        {formatCantidad(m.asignadoM3)}
                      </td>
                      <td className="px-4 py-2 text-sm text-blue-700 font-medium text-right tabular-nums">
                        {formatCantidad(m.consumidoEnPlanificacionM3)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right tabular-nums">
                        {formatCantidad(m.consumidoTotalM3)}
                      </td>
                      <td
                        className={`px-4 py-2 text-sm font-medium text-right tabular-nums ${
                          m.disponibleM3 < 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {formatCantidad(m.disponibleM3)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right tabular-nums">
                        {m.viajes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <p className="text-xs text-gray-500">
        &quot;Consumo total&quot; incluye todas las planificaciones que usan la misma cantera, por
        eso el disponible puede ser menor de lo despachado acá.
      </p>
    </div>
  );
};
