import axiosInstance from '@/config/axios';
import { Transportista } from '../types';

export const transportistaService = {
  getAll: async (): Promise<Transportista[]> => {
    const response = await axiosInstance.get<Transportista[]>('/transportistas');
    return Array.isArray(response.data) ? response.data : [];
  },

  /** Si ya existe con ese nombre (sin importar mayúsculas) devuelve ese con `yaExistia`. */
  create: async (name: string): Promise<Transportista> => {
    const response = await axiosInstance.post<Transportista>('/transportistas', { name });
    return response.data;
  },

  update: async (id: number, name: string): Promise<Transportista> => {
    const response = await axiosInstance.patch<Transportista>(`/transportistas/${id}`, { name });
    return response.data;
  },
};
