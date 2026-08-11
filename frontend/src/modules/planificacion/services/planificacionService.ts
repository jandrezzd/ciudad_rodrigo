import axiosInstance from '@/config/axios';
import { Planificacion, PlanificacionFormData } from '../types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common';

// URL base del backend para construir las URLs de archivos
const BACKEND_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Retorna la URL completa del PDF de factura guardado en el backend.
 * El backend almacena solo el nombre del archivo (ej: "invoice-12345.pdf")
 * y sirve los archivos estáticos desde /uploads/invoice/
 */
export const getInvoiceUrl = (invoicePath?: string | null): string | undefined => {
  if (!invoicePath) return undefined;
  // Si ya es una URL completa no la modificamos
  if (invoicePath.startsWith('http')) return invoicePath;
  return `${BACKEND_BASE}/uploads/invoice/${invoicePath}`;
};

export const planificacionService = {
  getAll: async (params?: PaginationParams): Promise<PaginatedResponse<Planificacion>> => {
    const response = await axiosInstance.get<PaginatedResponse<Planificacion>>('/plannings', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Planificacion> => {
    const response = await axiosInstance.get<Planificacion>(`/plannings/${id}`);
    return response.data;
  },

  create: async (data: PlanificacionFormData): Promise<Planificacion> => {
    // Usamos FormData para poder enviar el archivo PDF junto con los datos JSON
    const formData = new FormData();

    formData.append('description', data.description || '');
    formData.append('startDate', data.startDate);
    if (data.endDate) formData.append('endDate', data.endDate);
    formData.append('clientId', String(Number(data.clientId)));
    formData.append('constSiteId', String(Number(data.constSiteId)));

    // Número de factura y proveedor/cantera
    if (data.numeroFactura) formData.append('numeroFactura', data.numeroFactura);
    if (data.proveedorId) formData.append('proveedorId', data.proveedorId);
    if (Array.isArray(data.canteraIds)) {
      data.canteraIds.forEach((canteraId) => {
        formData.append('canteraIds', String(Number(canteraId)));
      });
    }

    // vehicleIds se envía repetidamente para que NestJS lo interprete como array
    data.vehicleIds.forEach((id) => formData.append('vehicleIds', String(Number(id))));

    // Archivo PDF de factura (si existe)
    if (data.facturaFile) {
      formData.append('invoice', data.facturaFile);
    }

    const response = await axiosInstance.post<Planificacion>('/plannings', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  update: async (id: string, data: Partial<PlanificacionFormData>): Promise<Planificacion> => {
    // Si hay archivo PDF, usamos FormData; si no, podemos usar JSON normal
    if (data.facturaFile) {
      const formData = new FormData();

      if (data.description !== undefined) formData.append('description', data.description || '');
      if (data.startDate) formData.append('startDate', data.startDate);
      if (data.endDate !== undefined) formData.append('endDate', data.endDate || '');
      if (data.status) formData.append('status', data.status);
      if (data.numeroFactura !== undefined) formData.append('numeroFactura', data.numeroFactura || '');
      if (data.proveedorId !== undefined) formData.append('proveedorId', data.proveedorId || '');
      if (Array.isArray(data.canteraIds)) {
        data.canteraIds.forEach((canteraId) => formData.append('canteraIds', String(Number(canteraId))));
      }
      if (Array.isArray(data.vehicleIds)) {
        data.vehicleIds.forEach((vehicleId) => formData.append('vehicleIds', String(Number(vehicleId))));
      }
      formData.append('invoice', data.facturaFile);

      const response = await axiosInstance.patch<Planificacion>(`/plannings/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }

    // Sin archivo: JSON estándar
    const payload: Record<string, unknown> = {};
    if (data.description !== undefined) payload.description = data.description;
    if (data.startDate) payload.startDate = data.startDate;
    if (data.endDate !== undefined) payload.endDate = data.endDate || null;
    if (data.status) payload.status = data.status;
    if (data.numeroFactura !== undefined) payload.numeroFactura = data.numeroFactura;
    if (data.proveedorId !== undefined) payload.proveedorId = data.proveedorId;
    if (Array.isArray(data.canteraIds)) payload.canteraIds = data.canteraIds.map((canteraId) => Number(canteraId));
    if (Array.isArray(data.vehicleIds)) {
      payload.vehicleIds = data.vehicleIds.map((vehicleId) => Number(vehicleId));
    }

    const response = await axiosInstance.patch<Planificacion>(`/plannings/${id}`, payload);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/plannings/${id}`);
  },

  addVehicle: async (id: string, vehicleId: string): Promise<Planificacion> => {
    const response = await axiosInstance.post<Planificacion>(`/plannings/${id}/vehicles/${vehicleId}`);
    return response.data;
  },

  removeVehicle: async (id: string, vehicleId: string): Promise<Planificacion> => {
    const response = await axiosInstance.delete<Planificacion>(`/plannings/${id}/vehicles/${vehicleId}`);
    return response.data;
  },
};
