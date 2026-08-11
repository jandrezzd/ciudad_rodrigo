import axiosInstance from '@/config/axios';
import { Cliente, ClienteFormData } from '../types';

export const clienteService = {
  getAll: async (): Promise<Cliente[]> => {
    const response = await axiosInstance.get<Cliente[]>('/clients');
    return response.data;
  },

  getById: async (id: number): Promise<Cliente> => {
    const response = await axiosInstance.get<Cliente>(`/clients/${id}`);
    return response.data;
  },

  create: async (data: Omit<ClienteFormData, 'isActive'>): Promise<Cliente> => {
    const response = await axiosInstance.post<Cliente>('/clients', data);
    return response.data;
  },

  update: async (id: number, data: Partial<ClienteFormData>): Promise<Cliente> => {
    const response = await axiosInstance.patch<Cliente>(`/clients/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/clients/${id}`);
  },
};
