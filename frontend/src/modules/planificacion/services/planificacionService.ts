import axiosInstance from '@/config/axios';
import {
  ConsumoMaterialPlanificacion,
  Planificacion,
  PlanificacionFormData,
  PlanningVehicleAsignado,
  VehicleCantera,
} from '../types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common';

/**
 * El backend recibe la planificación como multipart (por el PDF de factura), y
 * un arreglo de objetos no sobrevive a ese formato: viaja serializado.
 */
const serializeVehicleCanteras = (vehicleCanteras?: VehicleCantera[]) =>
  JSON.stringify(
    (vehicleCanteras ?? []).map((vc) => ({
      vehicleId: Number(vc.vehicleId),
      canteraId: vc.canteraId != null ? Number(vc.canteraId) : null,
    })),
  );

// URL base del backend para construir las URLs de archivos
const BACKEND_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** El formulario captura horas (más cómodo); el backend guarda minutos. */
const horasAMinutos = (horas?: string): number | undefined => {
  if (!horas) return undefined;
  const valor = Number(horas);
  if (!Number.isFinite(valor) || valor <= 0) return undefined;
  return Math.round(valor * 60);
};

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

    if (data.distanciaAproximadaKm) {
      formData.append('distanciaAproximadaKm', data.distanciaAproximadaKm);
    }
    const tiempoPromedioViajeMin = horasAMinutos(data.tiempoPromedioViajeHoras);
    if (tiempoPromedioViajeMin !== undefined) {
      formData.append('tiempoPromedioViajeMin', String(tiempoPromedioViajeMin));
    }

    if (data.vehicleCanteras?.length) {
      formData.append('vehicleCanteras', serializeVehicleCanteras(data.vehicleCanteras));
    }

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
      if (data.clientId) formData.append('clientId', String(Number(data.clientId)));
      if (data.constSiteId) formData.append('constSiteId', String(Number(data.constSiteId)));
      if (Array.isArray(data.canteraIds)) {
        data.canteraIds.forEach((canteraId) => formData.append('canteraIds', String(Number(canteraId))));
      }
      if (Array.isArray(data.vehicleIds)) {
        data.vehicleIds.forEach((vehicleId) => formData.append('vehicleIds', String(Number(vehicleId))));
      }
      if (data.vehicleCanteras?.length) {
        formData.append('vehicleCanteras', serializeVehicleCanteras(data.vehicleCanteras));
      }
      // Enviar cadena vacía (en vez de omitir el campo) cuando el usuario borró
      // el valor: el backend la interpreta como "limpiar el campo" (null).
      if (data.distanciaAproximadaKm !== undefined) {
        formData.append('distanciaAproximadaKm', data.distanciaAproximadaKm || '');
      }
      if (data.tiempoPromedioViajeHoras !== undefined) {
        const tiempoPromedioViajeMinUpd = horasAMinutos(data.tiempoPromedioViajeHoras);
        formData.append(
          'tiempoPromedioViajeMin',
          tiempoPromedioViajeMinUpd !== undefined ? String(tiempoPromedioViajeMinUpd) : '',
        );
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
    if (data.clientId) payload.clientId = Number(data.clientId);
    if (data.constSiteId) payload.constSiteId = Number(data.constSiteId);
    if (Array.isArray(data.canteraIds)) payload.canteraIds = data.canteraIds.map((canteraId) => Number(canteraId));
    if (Array.isArray(data.vehicleIds)) {
      payload.vehicleIds = data.vehicleIds.map((vehicleId) => Number(vehicleId));
    }
    if (data.vehicleCanteras) {
      payload.vehicleCanteras = data.vehicleCanteras.map((vc) => ({
        vehicleId: Number(vc.vehicleId),
        canteraId: vc.canteraId != null ? Number(vc.canteraId) : null,
      }));
    }
    // `undefined` no viaja en el JSON (Axios lo elimina al serializar), así que
    // un campo borrado por el usuario debe enviarse como `null` explícito para
    // que el backend lo limpie en vez de conservar el valor anterior.
    if (data.distanciaAproximadaKm !== undefined) {
      payload.distanciaAproximadaKm = data.distanciaAproximadaKm
        ? Number(data.distanciaAproximadaKm)
        : null;
    }
    if (data.tiempoPromedioViajeHoras !== undefined) {
      const tiempoPromedioViajeMinJson = horasAMinutos(data.tiempoPromedioViajeHoras);
      payload.tiempoPromedioViajeMin = tiempoPromedioViajeMinJson ?? null;
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

  /** Vehículos de la planificación con la cantera asignada a cada uno */
  getVehicles: async (id: string): Promise<PlanningVehicleAsignado[]> => {
    const response = await axiosInstance.get<PlanningVehicleAsignado[]>(
      `/plannings/${id}/vehicles`,
    );
    return response.data;
  },

  /** Consumo de material de la planificación, por cantera y material */
  getConsumoMaterial: async (id: string): Promise<ConsumoMaterialPlanificacion> => {
    const response = await axiosInstance.get<ConsumoMaterialPlanificacion>(
      `/plannings/${id}/consumo-material`,
    );
    return response.data;
  },

  /** Cambia la cantera desde la que despacha un vehículo ya asignado */
  setVehicleCantera: async (
    id: string,
    vehicleId: string,
    canteraId: string | null,
  ): Promise<Planificacion> => {
    const response = await axiosInstance.patch<Planificacion>(
      `/plannings/${id}/vehicles/${vehicleId}/cantera`,
      { canteraId: canteraId != null ? Number(canteraId) : null },
    );
    return response.data;
  },
};
