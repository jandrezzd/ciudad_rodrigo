import { useState, useEffect, useCallback } from 'react';
import { vehicleService } from '../services/vehicleService';
import { Vehicle, normalizeVehicleType } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await vehicleService.getAll();
      const sanitizedData = (Array.isArray(data) ? data : []).map(v => ({
        ...v,
        type: normalizeVehicleType(v.type) || 'INTERNO',
      }));
      setVehicles(sortByNewest(sanitizedData));
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar vehículos';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  return {
    vehicles,
    isLoading,
    error,
    refetch: fetchVehicles,
  };
};
