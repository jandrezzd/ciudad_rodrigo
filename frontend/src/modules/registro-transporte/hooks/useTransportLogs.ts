import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { transportLogService } from '../services/transportLogService';
import { TransportLog } from '../types';

const toTime = (value?: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const sortTransportLogs = (logs: TransportLog[]) => {
  return [...logs].sort((a, b) => {
    const aTime = toTime(a.createdAt ?? a.departureAt ?? null);
    const bTime = toTime(b.createdAt ?? b.departureAt ?? null);

    if (aTime !== null || bTime !== null) {
      return (bTime ?? 0) - (aTime ?? 0);
    }

    return (b.id ?? 0) - (a.id ?? 0);
  });
};

/** AAAA-MM-DD. Vacío = sin límite por ese lado. */
export interface RangoFechasViajes {
  desde?: string;
  hasta?: string;
}

/**
 * Sin fechas trae solo los viajes más recientes; con `desde` y/o `hasta`, el
 * backend devuelve todos los del rango. Cambiar el rango vuelve a consultar.
 */
export const useTransportLogs = (rango: RangoFechasViajes = {}) => {
  const { desde, hasta } = rango;
  const [transportLogs, setTransportLogs] = useState<TransportLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si el rango cambia mientras una consulta sigue en curso, solo se aplica la
  // respuesta de la última: una más lenta y vieja no debe pisarla.
  const ultimaConsulta = useRef(0);

  const fetchTransportLogs = useCallback(async () => {
    const consulta = ++ultimaConsulta.current;
    try {
      setIsLoading(true);
      setError(null);
      const data = await transportLogService.getAll({ desde, hasta });
      if (consulta !== ultimaConsulta.current) return;
      const list = Array.isArray(data) ? data : [];
      setTransportLogs(sortTransportLogs(list));
    } catch (err) {
      if (consulta !== ultimaConsulta.current) return;
      console.error(err);
      const errorMessage = 'Error al cargar registros de transporte';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (consulta === ultimaConsulta.current) setIsLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    fetchTransportLogs();
  }, [fetchTransportLogs]);

  return {
    transportLogs,
    isLoading,
    error,
    refetch: fetchTransportLogs,
  };
};
