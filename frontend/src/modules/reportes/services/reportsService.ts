import axiosInstance from '@/config/axios';
import {
  OwnerReportResponse,
  ReportOwnersResponse,
  ObraOption,
  PlanificacionReportItem,
  ReportClientsResponse,
  ClientReportResponse,
  ReportSupervisorsResponse,
  SupervisorReportResponse,
  MaterialConstSiteReportResponse,
  MaterialPlanningReportResponse,
  MaterialProviderListResponse,
  ProveedorMaterialReportResponse,
} from '../types';

export const reportsService = {
  // ─── PROVEEDORES ────────────────────────────────────────────────────────────
  getOwners: async (): Promise<ReportOwnersResponse> => {
    const response = await axiosInstance.get<ReportOwnersResponse>('/reports/owners');
    return response.data;
  },

  getOwnerReport: async (params: {
    ownerId: number;
    startDate: string;
    endDate: string;
  }): Promise<OwnerReportResponse> => {
    const response = await axiosInstance.get<OwnerReportResponse>('/reports/owner', {
      params,
    });
    return response.data;
  },

  // ─── OBRAS ──────────────────────────────────────────────────────────────────
  getObras: async (): Promise<ObraOption[]> => {
    const response = await axiosInstance.get<ObraOption[]>('/const-sites');
    return response.data;
  },

  getObraDetailReport: async (params: {
    constSiteId: number;
    startDate?: string;
    endDate?: string;
  }): Promise<import('../types').ObraDetailReportResponse> => {
    const response = await axiosInstance.get<import('../types').ObraDetailReportResponse>('/reports/const-site', {
      params,
    });
    return response.data;
  },

  // ─── PLANIFICACIONES ────────────────────────────────────────────────────────
  getPlanificaciones: async (): Promise<PlanificacionReportItem[]> => {
    const response = await axiosInstance.get<PlanificacionReportItem[]>('/plannings');
    return response.data;
  },

  // ─── CLIENTES ──────────────────────────────────────────────────────────────
  getClients: async (): Promise<ReportClientsResponse> => {
    const response = await axiosInstance.get<ReportClientsResponse>('/reports/clients');
    return response.data;
  },

  getClientReport: async (params: {
    clientId: number;
    startDate: string;
    endDate: string;
  }): Promise<ClientReportResponse> => {
    const response = await axiosInstance.get<ClientReportResponse>('/reports/client', {
      params,
    });
    return response.data;
  },

  // ─── SUPERVISORES ──────────────────────────────────────────────────────────
  getSupervisors: async (): Promise<ReportSupervisorsResponse> => {
    const response = await axiosInstance.get<ReportSupervisorsResponse>('/reports/supervisors');
    return response.data;
  },

  getSupervisorReport: async (params: {
    supervisorId: number;
    startDate: string;
    endDate: string;
  }): Promise<SupervisorReportResponse> => {
    const response = await axiosInstance.get<SupervisorReportResponse>('/reports/supervisor', {
      params,
    });
    return response.data;
  },

  // ─── MATERIALES ───────────────────────────────────────────────────────────
  getMaterialByConstSite: async (params: {
    materialId: number;
    startDate: string;
    endDate: string;
    constSiteId?: string;
  }): Promise<MaterialConstSiteReportResponse> => {
    const response = await axiosInstance.get<MaterialConstSiteReportResponse>(
      '/reports/material-constsite',
      { params },
    );
    return response.data;
  },

  getMaterialByPlanning: async (params: {
    planningId: number;
    startDate: string;
    endDate: string;
  }): Promise<MaterialPlanningReportResponse> => {
    const response = await axiosInstance.get<MaterialPlanningReportResponse>(
      '/reports/material-planning',
      { params },
    );
    return response.data;
  },

  // ─── PROVEEDOR MATERIAL ──────────────────────────────────────────────────
  getMaterialProviders: async (): Promise<MaterialProviderListResponse> => {
    const response = await axiosInstance.get<MaterialProviderListResponse>(
      '/reports/material-providers-list',
    );
    return response.data;
  },

  getMaterialProviderReport: async (params: {
    startDate: string;
    endDate: string;
    providerId?: number;
    canteraId?: number;
    factura?: string;
  }): Promise<ProveedorMaterialReportResponse> => {
    const query: Record<string, string> = {
      startDate: params.startDate,
      endDate: params.endDate,
    };
    if (params.providerId) query.providerId = String(params.providerId);
    if (params.canteraId) query.canteraId = String(params.canteraId);
    if (params.factura) query.factura = params.factura;

    const response = await axiosInstance.get<ProveedorMaterialReportResponse>(
      '/reports/material-provider-report',
      { params: query },
    );
    return response.data;
  },
};
