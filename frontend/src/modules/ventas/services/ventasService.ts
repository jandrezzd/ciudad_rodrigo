import axiosInstance from '@/config/axios';
import {
  UpdateVentaData,
  VentaCantera,
  VentaConsumoReport,
  VentaFilters,
  VentaQr,
} from '../types';

/** El backend a veces envuelve en { data }; mismo desempaquetado defensivo que
 *  usa transportLogService. */
const unwrap = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const unwrapList = <T,>(payload: unknown): T[] => {
  const data = unwrap<T[]>(payload);
  return Array.isArray(data) ? data : [];
};

export const ventasService = {
  getAll: async (filters: VentaFilters = {}): Promise<VentaCantera[]> => {
    const response = await axiosInstance.get('ventas', { params: filters });
    return unwrapList<VentaCantera>(response.data);
  },

  getById: async (id: number): Promise<VentaCantera> => {
    const response = await axiosInstance.get(`ventas/${id}`);
    return unwrap<VentaCantera>(response.data);
  },

  update: async (id: number, data: UpdateVentaData): Promise<VentaCantera> => {
    const response = await axiosInstance.patch(`ventas/${id}`, data);
    return unwrap<VentaCantera>(response.data);
  },

  /** Eliminación lógica: la fila queda en la base y desaparece de la grilla. */
  remove: async (id: number): Promise<void> => {
    await axiosInstance.delete(`ventas/${id}`);
  },

  getQrs: async (): Promise<VentaQr[]> => {
    const response = await axiosInstance.get('ventas/qr');
    return unwrapList<VentaQr>(response.data);
  },

  /**
   * Genera (o regenera) el QR de las canteras indicadas. Devuelve las rutas de
   * los PNG: el ZIP lo arma el navegador, igual que con los QR de vehículo.
   */
  generateQr: async (
    canteraIds: number[]
  ): Promise<{ success: boolean; qrUrls: string[] }> => {
    const response = await axiosInstance.post('ventas/qr/generate', { canteraIds });
    return response.data;
  },

  /** Baja lógica del punto de venta. Las ventas ya registradas se conservan. */
  deactivateQr: async (canteraId: number): Promise<void> => {
    await axiosInstance.patch(`ventas/qr/${canteraId}/deactivate`);
  },

  getReporteConsumo: async (filters: VentaFilters = {}): Promise<VentaConsumoReport> => {
    const response = await axiosInstance.get('ventas/reportes/consumo', {
      params: filters,
    });
    return unwrap<VentaConsumoReport>(response.data);
  },
};
