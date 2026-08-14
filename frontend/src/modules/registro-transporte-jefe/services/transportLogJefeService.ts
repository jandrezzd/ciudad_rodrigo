import axiosInstance from '@/config/axios';
import { TransportArrivalData, TransportCorrectionData, TransportDepartureData, TransportLog, TransportQrResponse } from '../types';

const unwrapResponse = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const unwrapList = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];

  const maybeData = (payload as { data?: unknown }).data;
  if (Array.isArray(maybeData)) return maybeData as T[];
  if (maybeData && typeof maybeData === 'object') {
    const nestedData = (maybeData as { data?: unknown }).data;
    if (Array.isArray(nestedData)) return nestedData as T[];
  }

  const transports = (payload as { transports?: unknown }).transports;
  if (Array.isArray(transports)) return transports as T[];

  const transportLogs = (payload as { transportLogs?: unknown }).transportLogs;
  if (Array.isArray(transportLogs)) return transportLogs as T[];

  if (maybeData && typeof maybeData === 'object') {
    const nestedTransports = (maybeData as { transports?: unknown }).transports;
    if (Array.isArray(nestedTransports)) return nestedTransports as T[];
    const nestedTransportLogs = (maybeData as { transportLogs?: unknown }).transportLogs;
    if (Array.isArray(nestedTransportLogs)) return nestedTransportLogs as T[];
  }

  return [];
};

export const transportLogJefeService = {
  getAll: async (): Promise<TransportLog[]> => {
    const response = await axiosInstance.get<TransportLog[] | { data: TransportLog[] }>('transport/');
    return unwrapList<TransportLog>(response.data);
  },

  getById: async (id: number): Promise<TransportLog> => {
    const response = await axiosInstance.get<TransportLog | { data: TransportLog }>(`transport/${id}/`);
    return unwrapResponse<TransportLog>(response.data);
  },

  getByQrCode: async (vehicleid: string): Promise<TransportQrResponse> => {
    const response = await axiosInstance.get<TransportQrResponse | { data: TransportQrResponse }>(
      `transport/qr/scan/`,
      { params: { vehicleid } },
    );
    return unwrapResponse<TransportQrResponse>(response.data);
  },

  createDeparture: async (data: TransportDepartureData): Promise<TransportLog> => {
    const formData = new FormData();
    if (data.vehicleId !== undefined && data.vehicleId !== null) {
      formData.append('vehicleId', String(data.vehicleId));
    }
    if (data.ownerId !== undefined && data.ownerId !== null) formData.append('ownerId', String(data.ownerId));
    if (data.clientId !== undefined && data.clientId !== null) formData.append('clientId', String(data.clientId));
    if (data.constSiteId !== undefined && data.constSiteId !== null) formData.append('constSiteId', String(data.constSiteId));
    if (data.planningId !== undefined && data.planningId !== null) formData.append('planningId', String(data.planningId));
    if (data.materialId !== undefined && data.materialId !== null) formData.append('materialId', String(data.materialId));
    // Sin esto el backend no sabe a qué cantera descontarle el material
    if (data.canteraId !== undefined && data.canteraId !== null) formData.append('canteraId', String(data.canteraId));
    if (typeof data.departureM3 === 'number') formData.append('departureM3', String(data.departureM3));
    if (typeof data.departureLat === 'number') formData.append('departureLat', String(data.departureLat));
    if (typeof data.departureLng === 'number') formData.append('departureLng', String(data.departureLng));
    if (data.driverFile) formData.append('driver', data.driverFile);
    if (data.vehicleFile) formData.append('vehicle', data.vehicleFile);
    if (data.plateFile) formData.append('plate', data.plateFile);
    if (data.materialFile) formData.append('material', data.materialFile);

    const response = await axiosInstance.post<TransportLog | { data: TransportLog }>(
      'transport/departure/',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return unwrapResponse<TransportLog>(response.data);
  },

  registerArrival: async (id: number, data: TransportArrivalData): Promise<TransportLog> => {
    const formData = new FormData();
    if (typeof data.arrivalM3 === 'number') formData.append('arrivalM3', String(data.arrivalM3));
    if (typeof data.arrivalLat === 'number') formData.append('arrivalLat', String(data.arrivalLat));
    if (typeof data.arrivalLng === 'number') formData.append('arrivalLng', String(data.arrivalLng));
    if (data.abscisa) formData.append('abscisa', data.abscisa);
    if (data.driverFile) formData.append('driver', data.driverFile);
    if (data.vehicleFile) formData.append('vehicle', data.vehicleFile);
    if (data.plateFile) formData.append('plate', data.plateFile);
    if (data.materialFile) formData.append('material', data.materialFile);

    const response = await axiosInstance.patch<TransportLog | { data: TransportLog }>(
      `transport/${id}/arrival/`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return unwrapResponse<TransportLog>(response.data);
  },

  correctMaterial: async (id: number, data: TransportCorrectionData): Promise<TransportLog> => {
    const response = await axiosInstance.patch<TransportLog | { data: TransportLog }>(
      `transport/${id}/correct-material/`,
      data,
    );
    return unwrapResponse<TransportLog>(response.data);
  },

  markValidated: async (id: number): Promise<TransportLog> => {
    const response = await axiosInstance.patch<TransportLog | { data: TransportLog }>(
      `transport/${id}/correct-material/`,
      { status: 'VALIDADO' },
    );
    return unwrapResponse<TransportLog>(response.data);
  },
};
