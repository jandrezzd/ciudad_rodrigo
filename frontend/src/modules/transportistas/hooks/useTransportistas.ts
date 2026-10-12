import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { transportistaService } from '../services/transportistaService';
import { Transportista } from '../types';

export const useTransportistas = () => {
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTransportistas = useCallback(async () => {
    try {
      setIsLoading(true);
      setTransportistas(await transportistaService.getAll());
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar transportistas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransportistas();
  }, [fetchTransportistas]);

  return { transportistas, isLoading, refetch: fetchTransportistas };
};
