import axiosInstance from '@/config/axios';
import {
  CrearLiquidacionPayload,
  EditarLiquidacionPayload,
  FiltrosLiquidaciones,
  FiltrosViajesLiquidables,
  LiquidacionDetalle,
  LiquidacionResumen,
  TransportLog,
} from '../types';

/**
 * Quita los parámetros vacíos: el backend valida con forbidNonWhitelisted y
 * tipos estrictos, así que no se mandan '' ni undefined.
 */
const sinVacios = (params: object) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

/** Backend propio del módulo: /liquidaciones (ver docs/liquidaciones). */
export const liquidacionService = {
  // ─── Liquidaciones de viajes ────────────────────────────────────────────
  listarViajes: async (filtros: FiltrosViajesLiquidables): Promise<TransportLog[]> => {
    const { data } = await axiosInstance.get<TransportLog[]>('/liquidaciones/viajes', {
      params: sinVacios(filtros),
    });
    return Array.isArray(data) ? data : [];
  },

  obtenerViaje: async (id: number): Promise<TransportLog> => {
    const { data } = await axiosInstance.get<TransportLog>(`/liquidaciones/viajes/${id}`);
    return data;
  },

  crear: async (payload: CrearLiquidacionPayload): Promise<LiquidacionDetalle> => {
    const { data } = await axiosInstance.post<LiquidacionDetalle>('/liquidaciones', payload);
    return data;
  },

  // ─── Historial ──────────────────────────────────────────────────────────
  listar: async (filtros: FiltrosLiquidaciones): Promise<LiquidacionResumen[]> => {
    const { data } = await axiosInstance.get<LiquidacionResumen[]>('/liquidaciones', {
      params: sinVacios(filtros),
    });
    return Array.isArray(data) ? data : [];
  },

  obtener: async (id: number): Promise<LiquidacionDetalle> => {
    const { data } = await axiosInstance.get<LiquidacionDetalle>(`/liquidaciones/${id}`);
    return data;
  },

  editar: async (id: number, payload: EditarLiquidacionPayload): Promise<LiquidacionDetalle> => {
    const { data } = await axiosInstance.patch<LiquidacionDetalle>(`/liquidaciones/${id}`, payload);
    return data;
  },

  /** Queda ANULADA en el historial y sus viajes vuelven a Liquidaciones de viajes. */
  anular: async (id: number, motivo: string): Promise<LiquidacionDetalle> => {
    const { data } = await axiosInstance.post<LiquidacionDetalle>(`/liquidaciones/${id}/anular`, {
      motivo,
    });
    return data;
  },

  /** Nota del liquidador de un viaje. null o '' la borran. */
  guardarNotaViaje: async (
    tripId: number,
    nota: string | null,
  ): Promise<Pick<TransportLog, 'notaLiquidador' | 'notaLiquidadorEn' | 'notaLiquidadorPor'>> => {
    const { data } = await axiosInstance.patch(`/liquidaciones/viajes/${tripId}/nota`, { nota });
    return data;
  },
};
