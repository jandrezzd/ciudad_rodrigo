import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ventaOrdenesService } from '../services/ventaOrdenesService';
import { VentaOrden, VentaOrdenFilters } from '../types';

/** Mismo contrato que el resto de los hooks del proyecto: { datos, isLoading, error, refetch }. */
export const useVentaOrdenes = (filters: VentaOrdenFilters = {}) => {
  const [ordenes, setOrdenes] = useState<VentaOrden[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrdenes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await ventaOrdenesService.getAll(filters);
      setOrdenes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar las órdenes de venta';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchOrdenes();
  }, [fetchOrdenes]);

  return { ordenes, isLoading, error, refetch: fetchOrdenes };
};
