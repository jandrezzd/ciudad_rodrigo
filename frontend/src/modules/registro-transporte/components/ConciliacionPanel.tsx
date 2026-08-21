import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { transportLogService } from '../services/transportLogService';
import { PendingArrivalRow, TransportLog } from '../types';

interface ConciliacionPanelProps {
  /** Se llama tras un emparejamiento exitoso, para refrescar la grilla principal. */
  onMatched: () => void;
}

export const ConciliacionPanel = ({ onMatched }: ConciliacionPanelProps) => {
  const [departures, setDepartures] = useState<TransportLog[]>([]);
  const [arrivals, setArrivals] = useState<PendingArrivalRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [selectedArrivalId, setSelectedArrivalId] = useState<number | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [deps, arrs] = await Promise.all([
        transportLogService.getUnmatchedDepartures(),
        transportLogService.getPendingArrivals(),
      ]);
      setDepartures(deps);
      setArrivals(arrs);
    } catch {
      toast.error('No se pudo cargar la cola de conciliación');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEmparejar = async () => {
    if (selectedTripId == null || selectedArrivalId == null) return;
    setIsMatching(true);
    try {
      await transportLogService.manualMatch(selectedTripId, selectedArrivalId);
      toast.success('Viaje emparejado correctamente');
      setSelectedTripId(null);
      setSelectedArrivalId(null);
      await load();
      onMatched();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'No se pudo emparejar el viaje');
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Viajes que no se emparejaron solos (vehículo averiado, o la salida/llegada sigue
        offline en el otro celular). Selecciona una salida y una llegada y empareja
        manualmente — no hace falta que sea la misma placa (por ejemplo, si un vehículo de
        reemplazo terminó el viaje).
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="font-semibold text-sm text-gray-800">
              Salidas sin llegada ({departures.length})
            </h4>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {isLoading && (
              <p className="p-4 text-sm text-gray-500">Cargando...</p>
            )}
            {!isLoading && departures.length === 0 && (
              <p className="p-4 text-sm text-gray-500">No hay salidas sin emparejar.</p>
            )}
            {departures.map((log) => (
              <label
                key={log.id}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-blue-50 ${
                  selectedTripId === log.id ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="conciliacion-trip"
                  className="mt-1"
                  checked={selectedTripId === log.id}
                  onChange={() => setSelectedTripId(log.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900">
                      {log.vehicle?.plate || '—'} · {log.vehicle?.vehicleid || '—'}
                    </span>
                    <StatusBadge
                      status={log.status === 'PENDIENTE_EMPAREJAMIENTO' ? 'pendiente_emparejamiento' : 'en_progreso'}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Salió: {formatDateTime(log.departureAt)} · {formatNumber(log.departureM3)} m³
                  </p>
                  <p className="text-xs text-gray-500">{log.constSite?.name || 'Obra sin nombre'}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="font-semibold text-sm text-gray-800">
              Llegadas sin salida ({arrivals.length})
            </h4>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {isLoading && (
              <p className="p-4 text-sm text-gray-500">Cargando...</p>
            )}
            {!isLoading && arrivals.length === 0 && (
              <p className="p-4 text-sm text-gray-500">No hay llegadas sin emparejar.</p>
            )}
            {arrivals.map((arrival) => (
              <label
                key={arrival.id}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-blue-50 ${
                  selectedArrivalId === arrival.id ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="conciliacion-arrival"
                  className="mt-1"
                  checked={selectedArrivalId === arrival.id}
                  onChange={() => setSelectedArrivalId(arrival.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900">
                      {arrival.plate} · {arrival.vehicleCode}
                    </span>
                    <StatusBadge status={arrival.status === 'EXPIRADO' ? 'inactivo' : 'pendiente_emparejamiento'} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Llegó: {formatDateTime(arrival.capturedAt)} · {formatNumber(arrival.m3Corrected ?? arrival.m3)} m³
                    {arrival.almuerzo && ' · 🍽 Almuerzo'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {arrival.registradoPor ? `Registrado por ${arrival.registradoPor}` : ''}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button
          variant="primary"
          disabled={selectedTripId == null || selectedArrivalId == null}
          isLoading={isMatching}
          onClick={handleEmparejar}
        >
          Emparejar seleccionados
        </Button>
      </div>
    </div>
  );
};
