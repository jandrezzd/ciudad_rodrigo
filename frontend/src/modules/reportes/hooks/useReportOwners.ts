import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { reportsService } from '../services/reportsService';
import { ReportOwnerOption } from '../types';

export const useReportOwners = () => {
  const [owners, setOwners] = useState<ReportOwnerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOwners = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await reportsService.getOwners();
      setOwners(response.owners || []);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar la lista de proveedores');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  return { owners, isLoading };
};
