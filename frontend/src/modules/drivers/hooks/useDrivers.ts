import { useState, useEffect, useCallback } from 'react';
import { driverService } from '../services/driverService';
import { Driver } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useDrivers = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await driverService.getAll();
      setDrivers(sortByNewest(data));
    } catch {
      const errorMessage = 'Error al cargar choferes';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  return {
    drivers,
    isLoading,
    error,
    refetch: fetchDrivers,
  };
};
