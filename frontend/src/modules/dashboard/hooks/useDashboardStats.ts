import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { dashboardService } from '../services/dashboardService';
import { DashboardStats } from '../types';

export const useDashboardStats = (refreshInterval = 10000) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      const data = await dashboardService.getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar estadísticas del dashboard';
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
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      fetchStats(true);
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [fetchStats, refreshInterval]);

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  };
};
