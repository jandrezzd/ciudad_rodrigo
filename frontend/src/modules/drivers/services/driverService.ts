import axiosInstance from '@/config/axios';
import { Driver, DriverFormData } from '../types';

export const driverService = {
  getAll: async (): Promise<Driver[]> => {
    const response = await axiosInstance.get<Driver[]>('/drivers');
    return response.data;
  },

  getById: async (id: number): Promise<Driver> => {
    const response = await axiosInstance.get<Driver>(`/drivers/${id}`);
    return response.data;
  },

  create: async (data: DriverFormData): Promise<Driver> => {
    const response = await axiosInstance.post<Driver>('/drivers', data);
    return response.data;
  },

  update: async (id: number, data: Partial<DriverFormData>): Promise<Driver> => {
    const response = await axiosInstance.patch<Driver>(`/drivers/${id}`, data);
    return response.data;
  },

  // Baja lógica: el backend bloquea si el chofer sigue siendo el conductor
  // actual de un vehículo activo (obliga a reasignarlo primero).
  deactivate: async (id: number): Promise<Driver> => {
    const response = await axiosInstance.patch<Driver>(`/drivers/${id}/deactivate`, {});
    return response.data;
  },
};
