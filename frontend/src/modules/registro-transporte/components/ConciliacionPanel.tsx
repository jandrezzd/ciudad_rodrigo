import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** Diferencia de tiempo salida→llegada en minutos. Negativa = la llegada es
 *  anterior a la salida, que es físicamente imposible y el backend rechaza.
 *  Devuelve null si falta alguna fecha o no es parseable: sin gap calculable no
 *  se marca nada como inválido, se deja decidir al backend. */
const gapEnMinutos = (
  departureAt?: string | Date | null,
  capturedAt?: string | Date | null,
): number | null => {
  if (!departureAt || !capturedAt) return null;
  const inicio = new Date(departureAt).getTime();
  const fin = new Date(capturedAt).getTime();
  if (isNaN(inicio) || isNaN(fin)) return null;
  return (fin - inicio) / 60000;
};

/** "1h 57m" / "45m". Mismo formato que la columna Tiempo de la grilla. */
const formatGap = (minutos: number) => {
  const abs = Math.abs(Math.round(minutos));
  const horas = Math.floor(abs / 60);
  const mins = abs % 60;
  const texto = horas === 0 ? `${mins}m` : `${horas}h ${mins}m`;
  return minutos < 0 ? `−${texto}` : texto;
};

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

  const selectedTrip = useMemo(
    () => departures.find((d) => d.id === selectedTripId) ?? null,
    [departures, selectedTripId],
  );

  /**
   * Con una salida seleccionada, las llegadas se ordenan por cercanía a esa
   * salida: es el mismo criterio (menor diferencia de tiempo) que usa el
   * emparejamiento automático, así que el ADMIN ve arriba la candidata que el
   * sistema habría elegido. Las anteriores a la salida van al final, marcadas
   * y deshabilitadas — el backend las rechaza por causalidad.
   */
  const arrivalsOrdenadas = useMemo(() => {
    const conGap = arrivals.map((a) => ({
      arrival: a,
      gap: selectedTrip ? gapEnMinutos(selectedTrip.departureAt, a.capturedAt) : null,
    }));
    if (!selectedTrip) return conGap;
    return conGap.sort((x, y) => {
      // Sin gap calculable, al final pero sin bloquear.
      if (x.gap == null) return 1;
      if (y.gap == null) return -1;
      const xInvalida = x.gap <= 0;
      const yInvalida = y.gap <= 0;
      if (xInvalida !== yInvalida) return xInvalida ? 1 : -1;
      return x.gap - y.gap;
    });
  }, [arrivals, selectedTrip]);

  const seleccionInvalida = useMemo(() => {
    if (!selectedTrip || selectedArrivalId == null) return false;
    const elegida = arrivals.find((a) => a.id === selectedArrivalId);
    if (!elegida) return false;
    const gap = gapEnMinutos(selectedTrip.departureAt, elegida.capturedAt);
    return gap != null && gap <= 0;
  }, [arrivals, selectedTrip, selectedArrivalId]);

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
      toast.error(message || 'No se pudo emparejar el viaje', { duration: 6000 });
      // Refrescar también al fallar: el barrido automático corre cada 5 min y
      // esta lista no se actualiza sola, así que la causa más común del error
      // es tener datos viejos en pantalla. Sin esto, reintentar reproduce el
      // mismo fallo indefinidamente.
      setSelectedTripId(null);
      setSelectedArrivalId(null);
      await load();
      onMatched();
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Viajes que no se emparejaron solos: vehículo averiado, la salida o la llegada sigue
        offline en el otro celular, dos candidatas igual de probables, o una llegada que
        acabas de liberar al desemparejar. Selecciona una salida y una llegada y empareja
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
            {arrivalsOrdenadas.map(({ arrival, gap }) => {
              const anteriorALaSalida = gap != null && gap <= 0;
              return (
                <label
                  key={arrival.id}
                  className={`flex items-start gap-3 p-3 ${
                    anteriorALaSalida
                      ? 'cursor-not-allowed opacity-60 bg-red-50/40'
                      : 'cursor-pointer hover:bg-blue-50'
                  } ${selectedArrivalId === arrival.id ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="conciliacion-arrival"
                    className="mt-1"
                    disabled={anteriorALaSalida}
                    checked={selectedArrivalId === arrival.id}
                    onChange={() => setSelectedArrivalId(arrival.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        {arrival.plate} · {arrival.vehicleCode}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {gap != null && (
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              anteriorALaSalida
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                            title={
                              anteriorALaSalida
                                ? 'Esta llegada es anterior a la salida seleccionada'
                                : 'Diferencia de tiempo con la salida seleccionada'
                            }
                          >
                            Δ {formatGap(gap)}
                          </span>
                        )}
                        {arrival.status === 'EN_REVISION' ? (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap"
                            title="Liberada al desemparejar un viaje. El emparejamiento automático no la tomará: espera que la empareje un administrador."
                          >
                            Liberada para revisión
                          </span>
                        ) : (
                          <StatusBadge status={arrival.status === 'EXPIRADO' ? 'inactivo' : 'pendiente_emparejamiento'} />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Llegó: {formatDateTime(arrival.capturedAt)} · {formatNumber(arrival.m3Corrected ?? arrival.m3)} m³
                      {arrival.almuerzo && ' · 🍽 Almuerzo'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {arrival.registradoPor ? `Registrado por ${arrival.registradoPor}` : ''}
                    </p>
                    {anteriorALaSalida && (
                      <p className="text-xs text-red-600 mt-0.5">
                        Anterior a la salida seleccionada — no se puede emparejar.
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center gap-4 pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          {selectedTrip
            ? 'Δ muestra el tiempo transcurrido entre la salida elegida y cada llegada. La candidata más probable es la de menor Δ.'
            : 'Selecciona una salida para ver el tiempo transcurrido hasta cada llegada.'}
        </p>
        <Button
          variant="primary"
          disabled={selectedTripId == null || selectedArrivalId == null || seleccionInvalida}
          isLoading={isMatching}
          onClick={handleEmparejar}
        >
          Emparejar seleccionados
        </Button>
      </div>
    </div>
  );
};
