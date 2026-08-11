import { Vehicle } from '@/modules/vehicles/types';
import { Obra } from '@/modules/obras/types';
import { Cliente } from '@/modules/clientes/types';

export type PlanningStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'CANCELADO' | 'RETRASADO';

export interface VehicleStats {
  totalVehicles: number;
  internalVehicles: number;
  externalVehicles: number;
}

export interface Planificacion {
  id: string;
  planningCode: string;
  description?: string;
  clientId: string;
  constSiteId: string;
  client?: Cliente;
  constSite?: Obra;
  startDate: string;
  endDate?: string;
  status: PlanningStatus;
  vehicleIds: string[];
  vehicles?: Vehicle[];
  vehicleStats?: VehicleStats;
  isActive?: boolean;
  proveedorId?: string;
  canteraIds?: string[];
  canteras?: any[];
  numeroFactura?: string;
  invoicePath?: string;
  facturaUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlanificacionFormData {
  description?: string;
  clientId: string;
  constSiteId: string;
  proveedorId?: string;
  canteraIds?: string[];
  numeroFactura?: string;
  facturaFile?: File | null;
  startDate: string;
  endDate?: string;
  status?: PlanningStatus;
  vehicleIds: string[];
}
