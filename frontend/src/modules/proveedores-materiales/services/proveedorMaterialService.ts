import axiosInstance from '@/config/axios';
import { ProveedorMaterial, ProveedorMaterialFormData } from '../types';

export const proveedorMaterialService = {
  getAll: async (): Promise<ProveedorMaterial[]> => {
    const response = await axiosInstance.get<ProveedorMaterial[]>('/material-providers');
    return response.data;
  },

  getById: async (id: number): Promise<ProveedorMaterial> => {
    const response = await axiosInstance.get<ProveedorMaterial>(`/material-providers/${id}`);
    return response.data;
  },

  create: async (data: ProveedorMaterialFormData): Promise<ProveedorMaterial> => {
    // El backend espera: { ruc, razonsocial, email, provincia, canton, direccion, canteras: [{nombre, provincia, canton, direccion}] }
    const payload = {
      ruc: data.ruc,
      razonsocial: data.razonsocial,
      email: data.email,
      provincia: data.provincia || undefined,
      canton: data.canton || undefined,
      direccion: data.direccion || undefined,
      canteras: data.canteras.map((c) => ({
        nombre: c.nombre,
        provincia: c.provincia || undefined,
        canton: c.canton || undefined,
        direccion: c.direccion || undefined,
      })),
    };
    const response = await axiosInstance.post<ProveedorMaterial>('/material-providers', payload);
    return response.data;
  },

  update: async (id: number, data: Partial<ProveedorMaterialFormData>): Promise<ProveedorMaterial> => {
    const payload: Record<string, unknown> = {};
    if (data.ruc !== undefined) payload.ruc = data.ruc;
    if (data.razonsocial !== undefined) payload.razonsocial = data.razonsocial;
    if (data.email !== undefined) payload.email = data.email;
    if (data.provincia !== undefined) payload.provincia = data.provincia || undefined;
    if (data.canton !== undefined) payload.canton = data.canton || undefined;
    if (data.direccion !== undefined) payload.direccion = data.direccion || undefined;
    if (data.canteras !== undefined) {
      payload.canteras = data.canteras.map((c) => ({
        nombre: c.nombre,
        provincia: c.provincia || undefined,
        canton: c.canton || undefined,
        direccion: c.direccion || undefined,
      }));
    }
    const response = await axiosInstance.patch<ProveedorMaterial>(`/material-providers/${id}`, payload);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/material-providers/${id}`);
  },
};

