import { useEffect, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { proveedorMaterialService } from '../services/proveedorMaterialService';
import { CanteraMovimiento, MovimientoDetallado } from '../types';

interface CanteraMovimientosModalProps {
  isOpen: boolean;
  onClose: () => void;
  canteraId?: number;
  canteraNombre?: string;
}

const TIPO_LABELS: Record<CanteraMovimiento['tipo'], string> = {
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  REVERSA: 'Reversa',
};

const TIPO_STYLES: Record<CanteraMovimiento['tipo'], string> = {
  SALIDA: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
  AJUSTE: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  REVERSA: 'bg-gray-100 dark:bg-night-raised text-gray-700 dark:text-night-text',
};

const formatFecha = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-EC');
};

const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

/**
 * Historial de despachos de una cantera. Se ordena por `capturedAt` (momento
 * real del despacho), no por la fecha de sincronización: con la app offline un
 * viaje del lunes puede llegar el jueves.
 */
export const CanteraMovimientosModal = ({
  isOpen,
  onClose,
  canteraId,
  canteraNombre,
}: CanteraMovimientosModalProps) => {
  const [movimientos, setMovimientos] = useState<MovimientoDetallado[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !canteraId) return;

    let activo = true;
    setIsLoading(true);
    setError(null);

    proveedorMaterialService
      .getMovimientosByCantera(canteraId)
      .then((data) => {
        if (activo) setMovimientos(data);
      })
      .catch((err) => {
        console.error(err);
        if (activo) setError('No se pudo cargar el historial de despachos');
      })
      .finally(() => {
        if (activo) setIsLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [isOpen, canteraId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Despachos${canteraNombre ? ` — ${canteraNombre}` : ''}`}
      size="xl"
    >
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-gray-500 dark:text-night-muted py-4">Cargando despachos...</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>}

        {!isLoading && !error && movimientos.length === 0 && (
          <div className="text-center py-8 bg-gray-50 dark:bg-night-raised rounded-lg border-2 border-dashed border-gray-300 dark:border-night-border">
            <p className="text-sm text-gray-500 dark:text-night-muted">
              Todavía no hay despachos registrados en esta cantera.
            </p>
          </div>
        )}

        {!isLoading && !error && movimientos.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-night-divider">
              <thead className="bg-gray-100 dark:bg-night-raised">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Material</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Vehículo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Conductor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Planificación</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-night-muted uppercase">M³</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-night-muted uppercase">TN</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-night-muted uppercase">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-night-divider">
                {movimientos.map((mov) => (
                  <tr key={mov.id}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-night-text whitespace-nowrap">
                      {formatFecha(mov.capturedAt)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-night-text">
                      {formatMaterialType(mov.canteraMaterial?.material?.materialType)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-night-muted whitespace-nowrap">
                      {mov.trip?.vehicle
                        ? `${mov.trip.vehicle.plate} (${mov.trip.vehicle.vehicleid})`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-night-muted whitespace-nowrap">
                      {mov.conductorViaje?.name || 'Sin registrar'}
                      {mov.cambioDeConductor && (
                        <span
                          className="block text-[10px] text-amber-600 dark:text-amber-400"
                          title={`Hoy el vehículo tiene asignado a ${mov.conductorActual?.name || 'otro conductor'}`}
                        >
                          hoy: {mov.conductorActual?.name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-night-muted whitespace-nowrap">
                      {mov.trip?.planning?.planningCode || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-night-text text-right tabular-nums font-medium">
                      {formatCantidad(mov.m3)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-night-muted text-right tabular-nums">
                      {formatCantidad(mov.toneladas)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_STYLES[mov.tipo]}`}
                        title={mov.motivo || undefined}
                      >
                        {TIPO_LABELS[mov.tipo]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-night-muted">
          Ordenado por el momento real del despacho. Un viaje registrado sin conexión aparece
          con su fecha original, no con la de sincronización.
        </p>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  );
};
