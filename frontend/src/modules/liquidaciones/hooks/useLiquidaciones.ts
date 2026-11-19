import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { liquidacionService } from '../services/liquidacionService';
import { FiltrosLiquidaciones, LiquidacionResumen } from '../types';
import { mensajeDeError } from '../utils/liquidacion';

/** Historial de liquidaciones; se recarga cuando cambian los filtros. */
export const useLiquidaciones = ({
  desde,
  hasta,
  constSiteId,
  clientId,
  estado,
  codigo,
}: FiltrosLiquidaciones) => {
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionResumen[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setLiquidaciones(
        await liquidacionService.listar({
          desde,
          hasta,
          constSiteId,
          clientId,
          estado,
          codigo: codigo?.trim(),
        }),
      );
    } catch (error) {
      console.error(error);
      toast.error(mensajeDeError(error, 'Error al cargar las liquidaciones'));
    } finally {
      setIsLoading(false);
    }
  }, [desde, hasta, constSiteId, clientId, estado, codigo]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { liquidaciones, isLoading, refetch };
};
