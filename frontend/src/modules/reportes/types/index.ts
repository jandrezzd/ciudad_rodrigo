export type ReportTransportStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'ALERTA'
  | 'REVISADO';

export type ReportOwnerStatus = 'NORMAL' | 'ALERTA' | 'REVISADO';

export interface ReportOwnerOption {
  id: number;
  name: string;
  companyname: string;
  ruc?: string | null;
  vehicleCount?: number;
}

export interface ReportOwnersResponse {
  success: boolean;
  owners: ReportOwnerOption[];
}

export interface ReportOwnerSummary {
  totalMovements: number;
  totalDepartureM3: number;
  totalVehicles: number;
}

export interface ReportOwnerInfo {
  id: number;
  name: string;
  companyname: string;
  ruc?: string | null;
}

export interface ReportPeriod {
  startDate: string;
  endDate: string;
}

export interface ReportMovement {
  id: number;
  departureAt?: string | null;
  arrivalAt?: string | null;
  status: ReportTransportStatus;
  departureM3?: number | null;
  departureM3Corrected?: number | null;
  arrivalM3?: number | null;
  arrivalM3Corrected?: number | null;
  deviationM3?: number | null;
  coordenadas?: {
    salida?: { lat?: number | null; lng?: number | null };
    llegada?: { lat?: number | null; lng?: number | null };
  };
  obras?: {
    id?: number | null;
    name?: string | null;
    address?: string | null;
  } | null;
  cliente?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
  } | null;
  usuario?: {
    id: number;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    roletype?: string | null;
    document?: string | null;
    phone?: string | null;
    company?: string | null;
  } | null;
}

export interface ReportVehicleInfo {
  id: number;
  vehicleid?: string | null;
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  type?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export interface ReportVehicle {
  vehicle: ReportVehicleInfo;
  totalMovements: number;
  totalDepartureM3: number;
  totalArrivalM3: number;
  movements: ReportMovement[];
}

export interface OwnerReportResponse {
  success: boolean;
  status?: ReportOwnerStatus;
  owner: ReportOwnerInfo;
  period: ReportPeriod;
  summary: ReportOwnerSummary;
  vehicles: ReportVehicle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE OBRAS
// ─────────────────────────────────────────────────────────────────────────────

export interface ObraOption {
  id: number;
  name: string;
  province: string;
  canton: string;
  address: string;
  isActive?: boolean;
}

export interface ObraReportDelivery {
  id: number;
  userId?: number;
  userArrivalId?: number | null;
  userRoleType?: string | null;
  status: ReportTransportStatus;
  departureAt: string | null;
  arrivalAt: string | null;
  departureM3: number | null;
  departureM3Corrected: number | null;
  arrivalM3: number | null;
  arrivalM3Corrected: number | null;
  deviationM3: number | null;
  vehicle: {
    vehicleid?: string | null;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    company?: string | null;
    isActive?: boolean;
    owner?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
  };
  planning?: {
    id: number;
    name: string;
  } | null;
  client?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
  } | null;
}

export interface ObraReportSummary {
  totalDeliveries: number;
  totalM3Delivered: number;
  totalM3Departed: number;
  deviation: number;
  uniqueVehicles: number;
  uniqueInternalVehicles: number;
  uniqueExternalVehicles: number;
}

export interface ObraDetailReportResponse {
  success: boolean;
  constSite: {
    id: number;
    name: string;
    province?: string | null;
    canton?: string | null;
    address?: string | null;
  };
  summary: ObraReportSummary;
  deliveries: ObraReportDelivery[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE PLANIFICACIONES
// ─────────────────────────────────────────────────────────────────────────────

export type PlanificacionReportStatus =
  | 'PENDIENTE'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'RETRASADO';

export interface PlanificacionVehicleItem {
  vehicle: {
    id: number;
    vehicleid?: string | null;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    isActive?: boolean;
    owner?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
  };
}

export interface PlanificacionReportItem {
  id: number;
  planningCode?: string | null;
  name?: string | null;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  status: PlanificacionReportStatus;
  isActive: boolean;
  clientId: number;
  constSiteId: number;
  client?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
    ruc?: string | null;
  } | null;
  constSite?: {
    id: number;
    name: string;
    province?: string | null;
    canton?: string | null;
    address?: string | null;
  } | null;
  vehicles?: PlanificacionVehicleItem[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE CLIENTES
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportClientOption {
  id: number;
  name?: string | null;
  companyname?: string | null;
  ruc?: string | null;
  type?: string | null;
  movementCount?: number;
}

export interface ReportClientsResponse {
  success: boolean;
  clients: ReportClientOption[];
}

export interface ClientReportSummary {
  totalMovements: number;
  totalDepartureM3: number;
  totalArrivalM3: number;
  totalDeviation: number;
  uniqueVehicles: number;
  uniqueProviders: number;
  uniqueConstSites: number;
}

export interface ClientReportByConstSite {
  constSite: {
    id: number;
    name: string;
    address?: string | null;
  };
  movements: number;
  totalDepartureM3: number;
  totalArrivalM3: number;
  totalDeviation: number;
}

export interface ClientReportMovement {
  id: number;
  departureAt: string | null;
  arrivalAt: string | null;
  status: ReportTransportStatus;
  departureM3: number | null;
  departureM3Corrected: number | null;
  arrivalM3: number | null;
  arrivalM3Corrected: number | null;
  deviationM3: number | null;
  vehicle: {
    id: number;
    vehicleid?: string | null;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    provider?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
  };
  constSite: {
    id: number;
    name: string;
  };
  planning?: {
    id: number;
    planningCode?: string | null;
  } | null;
  registeredBy: {
    id: number;
    name?: string | null;
    email?: string | null;
  };
}

export interface ClientReportResponse {
  success: boolean;
  status?: ReportOwnerStatus;
  client: {
    id: number;
    name?: string | null;
    companyname?: string | null;
    ruc?: string | null;
    type?: string | null;
  };
  period: ReportPeriod;
  summary: ClientReportSummary;
  byConstSite: ClientReportByConstSite[];
  movements: ClientReportMovement[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE SUPERVISORES
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSupervisorOption {
  id: number;
  name: string;
  email?: string | null;
  roletype?: string | null;
}

export interface ReportSupervisorsResponse {
  success: boolean;
  supervisors: ReportSupervisorOption[];
}

export interface SupervisorReportSummary {
  totalActions: number;
  totalDeparturesManaged: number;
  totalArrivalsManaged: number;
  totalM3Supervised: number;
}

export interface SupervisorReportMovement {
  id: number;
  date: string;
  action: 'SALIDA' | 'LLEGADA';
  status: ReportTransportStatus;
  vehicle: {
    plate?: string | null;
    vehicleid?: string | null;
  };
  constSite?: string | null;
  m3?: number | null;
}

export interface SupervisorReportResponse {
  success: boolean;
  supervisor: {
    id: number;
    name: string;
    email?: string | null;
    roleType?: string | null;
  };
  period: ReportPeriod;
  summary: SupervisorReportSummary;
  details: SupervisorReportMovement[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE MATERIALES
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialReportSummary {
  totalDeliveries: number;
  totalM3Delivered: number;
  totalM3Departed: number;
  deviation: number;
  uniqueVehicles: number;
  uniqueOwners?: number;
  uniqueConstSites?: number;
  uniqueInternalVehicles?: number;
  uniqueExternalVehicles?: number;
}

export interface MaterialDelivery {
  id: number;
  status: ReportTransportStatus;
  departureAt: string | null;
  arrivalAt: string | null;
  departureM3: number | null;
  departureM3Corrected: number | null;
  arrivalM3: number | null;
  arrivalM3Corrected: number | null;
  deviationM3: number | null;
  material?: string | null;
  abscisa?: number | null;
  vehicle?: {
    vehicleid?: string | null;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    owner?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
  } | null;
  owner?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
  } | null;
  planning?: {
    id: number;
    planningCode?: string | null;
  } | null;
  client?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
  } | null;
  constSite?: {
    id: number;
    name: string;
  } | null;
}

export interface MaterialConstSiteReportResponse {
  success: boolean;
  material: {
    id: number;
    materialType: string;
  };
  constSite?: {
    id: number;
    name: string;
    province?: string | null;
    canton?: string | null;
    address?: string | null;
  };
  period: ReportPeriod;
  summary: MaterialReportSummary;
  deliveries: MaterialDelivery[];
}

export interface MaterialPlanningReportResponse {
  success: boolean;
  planning: {
    id: number;
    planningCode?: string | null;
    description?: string | null;
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    client?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
    constSite?: {
      id: number;
      name?: string | null;
    } | null;
  };
  period: ReportPeriod;
  summary: MaterialReportSummary;
  deliveries: MaterialDelivery[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PARA REPORTE DE PROVEEDOR MATERIAL
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialProviderOption {
  id: number;
  razonsocial: string;
  canteras: { id: number; nombre: string }[];
}

export interface MaterialProviderListResponse {
  success: boolean;
  providers: MaterialProviderOption[];
}

export interface ProveedorMaterialMovement {
  id: number;
  numeroFactura?: string | null;
  status: ReportTransportStatus;
  departureAt: string | null;
  arrivalAt: string | null;
  departureM3: number | null;
  departureM3Corrected: number | null;
  arrivalM3: number | null;
  arrivalM3Corrected: number | null;
  deviationM3: number | null;
  vehicle?: {
    id?: number;
    vehicleid?: string | null;
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    owner?: {
      id: number;
      name?: string | null;
      companyname?: string | null;
    } | null;
  } | null;
  owner?: {
    id: number;
    name?: string | null;
    companyname?: string | null;
  } | null;
  planning?: {
    id: number;
    planningCode?: string | null;
    canteras: {
      id: number;
      nombre: string;
      proveedor?: string | null;
    }[];
  } | null;
  constSite?: {
    id: number;
    name: string;
  } | null;
}

export interface ProveedorMaterialReportSummary {
  totalMovements: number;
  totalDepartureM3: number;
  totalArrivalM3: number;
  deviation: number;
}

export interface ProveedorMaterialReportResponse {
  success: boolean;
  period: ReportPeriod;
  summary: ProveedorMaterialReportSummary;
  movements: ProveedorMaterialMovement[];
}

