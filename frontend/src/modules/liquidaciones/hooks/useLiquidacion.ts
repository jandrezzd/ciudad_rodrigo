import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { liquidacionService } from '../services/liquidacionService';
import { LiquidacionDetalle } from '../types';
import { mensajeDeError } from '../utils/liquidacion';

/** Detalle de una liquidación; se carga cuando hay id (al abrir el modal). */
export const useLiquidacion = (id: number | null) => {
  const [liquidacion, setLiquidacion] = useState<LiquidacionDetalle | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (id == null) {
      setLiquidacion(null);
      return;
    }
    try {
      setIsLoading(true);
      setLiquidacion(await liquidacionService.obtener(id));
    } catch (error) {
      console.error(error);
      toast.error(mensajeDeError(error, 'No se pudo cargar la liquidación'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { liquidacion, isLoading, refetch, setLiquidacion };
};
