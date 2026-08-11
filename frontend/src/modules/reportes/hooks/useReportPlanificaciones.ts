import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { reportsService } from '../services/reportsService';
import { PlanificacionReportItem } from '../types';

export const useReportPlanificaciones = () => {
  const [planificaciones, setPlanificaciones] = useState<PlanificacionReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPlanificaciones = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await reportsService.getPlanificaciones();
      // El endpoint /plannings devuelve un array directamente
      setPlanificaciones(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar la lista de planificaciones');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlanificaciones();
  }, [fetchPlanificaciones]);

  return { planificaciones, isLoading, refetch: fetchPlanificaciones };
};
