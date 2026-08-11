import { useState, useEffect, useCallback } from 'react';
import { obraService } from '../services/obraService';
import { Obra } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

const normalizeObra = (obra: Obra): Obra => {
  const relations = Array.isArray(obra.clients) ? obra.clients : [];
  const primaryRelation = relations.find((relation) => relation?.client?.isActive !== false) || relations[0];
  const primaryClient = primaryRelation?.client;

  return {
    ...obra,
    clients: relations,
    clientId: primaryRelation ? String(primaryRelation.clientId) : undefined,
    client: primaryClient,
  };
};

export const useObras = () => {
  const [obras, setObras] = useState<Obra[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchObras = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await obraService.getAll();
      const list = Array.isArray(data) ? data : [];
      setObras(sortByNewest(list.map(normalizeObra)));
    } catch (err) {
      console.error(err);
      setError('Error al cargar obras');
      toast.error('Error al cargar obras');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchObras();
  }, [fetchObras]);

  return {
    obras,
    isLoading,
    error,
    refetch: fetchObras,
  };
};
