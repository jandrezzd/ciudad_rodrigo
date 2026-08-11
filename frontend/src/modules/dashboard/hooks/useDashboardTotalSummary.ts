import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { dashboardService } from '../services/dashboardService';
import { DashboardTotalSummary } from '../types';

export const useDashboardTotalSummary = (refreshInterval = 10000) => {
  const [summary, setSummary] = useState<DashboardTotalSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchSummary = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }

      setError(null);
      const data = await dashboardService.getTotalSummary();
      setSummary(data);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar el resumen total diario';
      setError(errorMessage);
      if (!silent && !hasLoadedRef.current) {
        toast.error(errorMessage);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;

    const intervalId = window.setInterval(() => {
      fetchSummary(true);
    }, refreshInterval);

    return () => window.clearInterval(intervalId);
  }, [fetchSummary, refreshInterval]);

  return {
    summary,
    isLoading,
    error,
    refetch: fetchSummary,
  };
};
