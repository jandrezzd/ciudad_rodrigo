import axiosInstance from '@/config/axios';
import { Modulo, PermissionMatrixRow, Role, RoleFormData } from '../types';

export const roleService = {
  getAll: async (): Promise<Role[]> => {
    const response = await axiosInstance.get<Role[]>('roles');
    return response.data;
  },

  getModulos: async (): Promise<Modulo[]> => {
    const response = await axiosInstance.get<Modulo[]>('roles/modulos');
    return response.data;
  },

  getById: async (id: number): Promise<Role> => {
    const response = await axiosInstance.get<Role>(`roles/${id}`);
    return response.data;
  },

  create: async (data: RoleFormData): Promise<Role> => {
    const response = await axiosInstance.post<Role>('roles', {
      name: data.name,
      description: data.description || undefined,
    });
    return response.data;
  },

  update: async (id: number, data: Partial<RoleFormData>): Promise<Role> => {
    const response = await axiosInstance.patch<Role>(`roles/${id}`, data);
    return response.data;
  },

  updatePermissions: async (id: number, permisos: PermissionMatrixRow[]): Promise<Role> => {
    const response = await axiosInstance.patch<Role>(`roles/${id}/permissions`, { permisos });
    return response.data;
  },

  /** Baja lógica. Rechaza si es de sistema o tiene usuarios asignados. */
  remove: async (id: number): Promise<void> => {
    await axiosInstance.delete(`roles/${id}`);
  },
};
