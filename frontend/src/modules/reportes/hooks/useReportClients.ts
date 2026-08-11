import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { reportsService } from '../services/reportsService';
import { ReportClientOption } from '../types';

export const useReportClients = () => {
  const [clients, setClients] = useState<ReportClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await reportsService.getClients();
      setClients(response.clients || []);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar la lista de clientes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return { clients, isLoading, refetch: fetchClients };
};
