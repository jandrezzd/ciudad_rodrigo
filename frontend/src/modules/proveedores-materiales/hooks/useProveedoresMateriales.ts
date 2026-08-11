import { useState, useEffect, useCallback } from 'react';
import { proveedorMaterialService } from '../services/proveedorMaterialService';
import { ProveedorMaterial } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useProveedoresMateriales = () => {
  const [proveedores, setProveedores] = useState<ProveedorMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProveedores = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await proveedorMaterialService.getAll();
      const list = Array.isArray(data) ? data : [];
      // Any backend objects usually have createdAt if you support it, or you can skip it.
      setProveedores(sortByNewest(list));
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar proveedores de material';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  return {
    proveedores,
    isLoading,
    error,
    refetch: fetchProveedores,
  };
};
