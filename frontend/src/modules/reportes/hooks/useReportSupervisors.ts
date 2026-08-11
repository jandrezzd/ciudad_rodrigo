import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { reportsService } from '../services/reportsService';
import { ReportSupervisorOption } from '../types';

export const useReportSupervisors = () => {
  const [supervisors, setSupervisors] = useState<ReportSupervisorOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSupervisors = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await reportsService.getSupervisors();
      setSupervisors(response.supervisors || []);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar la lista de supervisores');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSupervisors();
  }, [fetchSupervisors]);

  return { supervisors, isLoading, refetch: fetchSupervisors };
};
