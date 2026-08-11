import api from '@/config/axios';
import { CreateUserData, UpdateUserData } from '../types';

export const userService = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  create: async (data: CreateUserData) => {
    const response = await api.post('/users', data);
    return response.data;
  },

  update: async (id: number, data: UpdateUserData) => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  }
};
