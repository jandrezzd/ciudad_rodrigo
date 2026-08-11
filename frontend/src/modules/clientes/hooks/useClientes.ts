import { useState, useEffect, useCallback } from 'react';
import { clienteService } from '../services/clienteService';
import { Cliente } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useClientes = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeClientType = (typeValue: Cliente['type']): Cliente['type'] => {
    if (!typeValue) return typeValue;
    const normalized = String(typeValue).toUpperCase();
    if (normalized === 'PUBLIC') return 'PUBLICO';
    if (normalized === 'PRIVATE') return 'PRIVADO';
    return normalized as Cliente['type'];
  };

  const fetchClientes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await clienteService.getAll();
      const rawData = Array.isArray(response) ? response : (response as { data?: Cliente[] }).data || [];
      const sanitizedData = rawData.map((c: Cliente) => ({
        ...c,
        type: normalizeClientType(c.type),
        isActive: c.isActive === true || String(c.isActive) === 'true' || Number(c.isActive) === 1
      }));
      setClientes(sortByNewest(sanitizedData));
    } catch {
      const errorMessage = 'Error al cargar clientes';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  return {
    clientes,
    isLoading,
    error,
    refetch: fetchClientes,
  };
};
