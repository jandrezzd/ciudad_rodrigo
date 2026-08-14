import axiosInstance from '@/config/axios';
import {
  CanteraFormData,
  CanteraMaterialFormData,
  ProveedorMaterial,
  ProveedorMaterialFormData,
} from '../types';

/** El formulario maneja TN y M3 como texto; el backend los espera numéricos */
const toNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toCanteraMaterialPayload = (m: CanteraMaterialFormData) => ({
  materialId: m.materialId,
  toneladas: toNumber(m.toneladas),
  metrosCubicos: toNumber(m.metrosCubicos),
  factor: toNumber(m.factor),
  direccionConversion: m.direccionConversion,
});

/**
 * El `id` viaja de vuelta al backend a propósito: permite actualizar la cantera
 * en lugar de borrarla y recrearla, conservando sus planificaciones asignadas y
 * su historial de despachos.
 */
const toCanteraPayload = (c: CanteraFormData) => ({
  ...(c.id != null && { id: c.id }),
  nombre: c.nombre,
  provincia: c.provincia || undefined,
  canton: c.canton || undefined,
  direccion: c.direccion || undefined,
  materiales: c.materiales.map(toCanteraMaterialPayload),
});

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
    const payload = {
      ruc: data.ruc,
      razonsocial: data.razonsocial,
      nombreComercial: data.nombreComercial || undefined,
      tipo: data.tipo || undefined,
      email: data.email,
      provincia: data.provincia || undefined,
      canton: data.canton || undefined,
      direccion: data.direccion || undefined,
      canteras: data.canteras.map(toCanteraPayload),
    };
    const response = await axiosInstance.post<ProveedorMaterial>('/material-providers', payload);
    return response.data;
  },

  update: async (id: number, data: Partial<ProveedorMaterialFormData>): Promise<ProveedorMaterial> => {
    const payload: Record<string, unknown> = {};
    if (data.ruc !== undefined) payload.ruc = data.ruc;
    if (data.razonsocial !== undefined) payload.razonsocial = data.razonsocial;
    if (data.nombreComercial !== undefined) payload.nombreComercial = data.nombreComercial || undefined;
    if (data.tipo !== undefined) payload.tipo = data.tipo || undefined;
    if (data.email !== undefined) payload.email = data.email;
    if (data.provincia !== undefined) payload.provincia = data.provincia || undefined;
    if (data.canton !== undefined) payload.canton = data.canton || undefined;
    if (data.direccion !== undefined) payload.direccion = data.direccion || undefined;
    if (data.canteras !== undefined) {
      payload.canteras = data.canteras.map(toCanteraPayload);
    }
    const response = await axiosInstance.patch<ProveedorMaterial>(`/material-providers/${id}`, payload);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/material-providers/${id}`);
  },
};
