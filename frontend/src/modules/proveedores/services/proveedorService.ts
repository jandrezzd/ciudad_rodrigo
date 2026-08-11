import axiosInstance from '@/config/axios';
import { Proveedor, ProveedorFormData } from '../types';

export const proveedorService = {
  getAll: async (): Promise<Proveedor[]> => {
    const response = await axiosInstance.get<Proveedor[]>('/owners');
    return response.data;
  },

  create: async (data: ProveedorFormData): Promise<Proveedor> => {
    const response = await axiosInstance.post<Proveedor>('/owners', data);
    return response.data;
  },

  update: async (id: number, data: Partial<ProveedorFormData>): Promise<Proveedor> => {
    const response = await axiosInstance.patch<Proveedor>(`/owners/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/owners/${id}`);
  },
};
