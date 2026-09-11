import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ventasService } from '../services/ventasService';
import { VentaCantera } from '../types';

/**
 * Ventas de cantera. Mismo contrato que el resto de los hooks del proyecto:
 * { datos, isLoading, error, refetch }.
 *
 * Sin filtros de servidor: se traen las activas y el filtrado fino se hace en
 * la vista, igual que en el registro de transporte.
 */
export const useVentas = () => {
  const [ventas, setVentas] = useState<VentaCantera[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVentas = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await ventasService.getAll();
      setVentas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar las ventas de cantera';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  return { ventas, isLoading, error, refetch: fetchVentas };
};
