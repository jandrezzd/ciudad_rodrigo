import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { reportsService } from '../services/reportsService';
import { ObraOption } from '../types';

export const useReportObras = () => {
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchObras = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await reportsService.getObras();
      // El endpoint /const-sites devuelve un array directamente
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar la lista de obras');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchObras();
  }, [fetchObras]);

  return { obras, isLoading };
};
