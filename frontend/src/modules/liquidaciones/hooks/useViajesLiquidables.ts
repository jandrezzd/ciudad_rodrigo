import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { liquidacionService } from '../services/liquidacionService';
import { FiltrosViajesLiquidables, TransportLog } from '../types';
import { mensajeDeError } from '../utils/liquidacion';

/**
 * Viajes emparejados todavía no liquidados. Fechas (opcionales), obra y
 * cliente se filtran en el backend; se recarga cuando cambia alguno de ellos.
 */
export const useViajesLiquidables = ({
  desde,
  hasta,
  constSiteId,
  clientId,
}: FiltrosViajesLiquidables) => {
  const [viajes, setViajes] = useState<TransportLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    // Sin fechas se piden todos los pendientes: solo vienen los no liquidados,
    // así que la lista no crece sin límite (el backend corta en 500).
    try {
      setIsLoading(true);
      setViajes(await liquidacionService.listarViajes({ desde, hasta, constSiteId, clientId }));
    } catch (error) {
      console.error(error);
      toast.error(mensajeDeError(error, 'Error al cargar los viajes'));
    } finally {
      setIsLoading(false);
    }
  }, [desde, hasta, constSiteId, clientId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { viajes, isLoading, refetch };
};
