import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { materialService } from '../services/materialService';
import { Material } from '../types';

export const useMateriales = () => {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMateriales = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await materialService.getAll();
      setMateriales(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar materiales';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMateriales();
  }, [fetchMateriales]);

  return {
    materiales,
    isLoading,
    error,
    refetch: fetchMateriales,
  };
};
