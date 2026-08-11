import { useState, useEffect, useCallback } from 'react';
import { reportsService } from '../services/reportsService';
import { MaterialProviderOption } from '../types';

export const useReportProveedorMaterial = () => {
  const [providers, setProviders] = useState<MaterialProviderOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await reportsService.getMaterialProviders();
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { providers, isLoading };
};
