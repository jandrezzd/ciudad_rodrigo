import axiosInstance from '@/config/axios';
import { Material } from '../types';

export const materialService = {
  getAll: async (): Promise<Material[]> => {
    const response = await axiosInstance.get<Material[] | { data: Material[] }>('/material');
    if (Array.isArray(response.data)) return response.data;
    return response.data?.data ?? [];
  },
};
