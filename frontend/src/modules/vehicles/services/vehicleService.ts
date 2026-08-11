import axiosInstance from '@/config/axios';
import { Vehicle, VehicleFormData, VehicleQRCode, normalizeVehicleType } from '../types';
import { normalizePlate } from '@/shared/utils/validation';

export const vehicleService = {
  getAll: async (): Promise<Vehicle[]> => {
    const response = await axiosInstance.get<Vehicle[]>('/vehicles');
    return response.data;
  },

  create: async (data: VehicleFormData): Promise<Vehicle> => {
    const payloadBase: Partial<VehicleFormData> = { ...data };
    delete payloadBase.isActive;
    
    const normalizedType = payloadBase.type
      ? (normalizeVehicleType(payloadBase.type) || payloadBase.type)
      : undefined;
    if (payloadBase.capacity === '' || payloadBase.capacity === null || payloadBase.capacity === undefined) {
      delete payloadBase.capacity;
    } else {
      const parsedCapacity = Number(payloadBase.capacity);
      if (Number.isFinite(parsedCapacity)) {
        payloadBase.capacity = parsedCapacity;
      }
    }
    if (!payloadBase.ownerId || payloadBase.ownerId <= 0) {
      delete payloadBase.ownerId;
    }
    if (!payloadBase.driverId) {
      delete payloadBase.driverId;
    }

    const payload = {
      ...payloadBase,
      ...(normalizedType ? { type: normalizedType } : {}),
      plate: normalizePlate(payloadBase.plate ?? ''),
    };
    if (normalizedType === 'EXTERNO') {
      payload.company = null;
    } else if (!payload.company) {
      delete payload.company;
    }
    try {
      const response = await axiosInstance.post<Vehicle>('/vehicles', payload);
      return response.data;
    } catch (error) {
      const err = error as {
        message?: string;
        response?: { data?: unknown; status?: number };
      };
      console.error('[vehicles.create] error', {
        payload,
        status: err.response?.status,
        response: err.response?.data,
        message: err.message,
      });
      throw error;
    }
  },

  update: async (id: number, data: Partial<VehicleFormData>): Promise<Vehicle> => {
    const cleanData = { ...data };
    
    const normalizedType = cleanData.type
      ? (normalizeVehicleType(cleanData.type) || cleanData.type)
      : undefined;
    const payload: Partial<VehicleFormData> = {
      ...cleanData,
      ...(normalizedType ? { type: normalizedType } : {}),
      ...(cleanData.plate !== undefined ? { plate: normalizePlate(cleanData.plate) } : {}),
    };
    if (payload.capacity === '' || payload.capacity === null || payload.capacity === undefined) {
      delete payload.capacity;
    } else if (payload.capacity !== undefined) {
      const parsedCapacity = Number(payload.capacity);
      if (Number.isFinite(parsedCapacity)) {
        payload.capacity = parsedCapacity;
      }
    }
    if (!payload.ownerId || payload.ownerId <= 0) {
      delete payload.ownerId;
    }
    if (payload.driverId === null || payload.driverId === undefined) {
      payload.driverId = null;
    }
    
    if (normalizedType === 'EXTERNO') {
      payload.company = null;
    } else if (!payload.company) {
      delete payload.company;
    }
    const response = await axiosInstance.patch<Vehicle>(`/vehicles/${id}`, payload);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/vehicles/${id}`);
  },

  generateBatch: async (internalCount: number, externalCount: number): Promise<{ success: boolean; qrUrls: string[] }> => {
    const response = await axiosInstance.post<{ success: boolean; qrUrls: string[] }>(
      '/vehicles/generate-batch',
      { internalCount, externalCount }
    );
    return response.data;
  },

  getAvailableQRCodes: async (): Promise<VehicleQRCode[]> => {
    const response = await axiosInstance.get<VehicleQRCode[]>('/vehicles/qrcodes/available');
    return response.data;
  },

  getQRCodeByVehicleId: async (vehicleId: number): Promise<{
    url: string | null;
    qrcode?: string | null;
    qrcodeId?: number | null;
    status?: VehicleQRCode['status'] | null;
  }> => {
    const response = await axiosInstance.get<{
      url: string | null;
      qrcode?: string | null;
      qrcodeId?: number | null;
      status?: VehicleQRCode['status'] | null;
    }>(`/vehicles/qrcode/${vehicleId}`);
    return response.data;
  },

  generateNewQRForVehicle: async (vehicleId: number): Promise<{
    url: string;
    qrcode: string;
    qrcodeId?: number;
  }> => {
    const response = await axiosInstance.post<{
      url: string;
      qrcode: string;
      qrcodeId?: number;
    }>(`/vehicles/${vehicleId}/generate-new-qr`);
    return response.data;
  },

  detachQRCode: async (vehicleId: number): Promise<void> => {
    await axiosInstance.patch(`/vehicles/${vehicleId}/detach-qr`);
  },
};
