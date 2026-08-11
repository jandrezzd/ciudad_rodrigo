import { useCallback, useEffect, useState } from 'react';
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

export const useTransportLogs = () => {
  const [transportLogs, setTransportLogs] = useState<TransportLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransportLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await transportLogService.getAll();
      const list = Array.isArray(data) ? data : [];
      setTransportLogs(sortTransportLogs(list));
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar registros de transporte';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
