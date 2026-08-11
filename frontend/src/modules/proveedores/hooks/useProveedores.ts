import { useState, useEffect, useCallback } from 'react';
import { proveedorService } from '../services/proveedorService';
import { Proveedor } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useProveedores = () => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProveedores = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await proveedorService.getAll();
      const list = Array.isArray(data) ? data : [];
      setProveedores(sortByNewest(list));
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar proveedores';
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
