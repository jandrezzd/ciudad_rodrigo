import { VehicleCompany, VehicleTypeInput } from '@/modules/vehicles/types';

export type TransportStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'ALERTA'
  | 'REVISADO';

export interface TransportLog {
  id: number;
  userId: number;
  userArrivalId?: number | null;
  vehicleId: number;
  ownerId?: number | null;
  clientId?: number | null;
  constSiteId?: number | null;
  planningId?: number | null;
  materialId?: number | null;
  userRoleType?: string | null;
  departureAt?: string;
  departureM3: number;
  departureM3Corrected?: number | null;
  departureDriverPhoto: string;
  departureVehiclePhoto: string;
  departurePlatePhoto: string;
  departureMaterialPhoto?: string;
  departureMaterialPhoto1?: string | null;
  departureMaterialPhoto2?: string | null;
  departureLat: number;
  departureLng: number;
  arrivalAt?: string | null;
  arrivalM3?: number | null;
  arrivalM3Corrected?: number | null;
  deviationM3?: number | null;
  observation?: string | null;
  abscisa?: number | null;
  arrivalDriverPhoto?: string | null;
  arrivalVehiclePhoto?: string | null;
  arrivalPlatePhoto?: string | null;
  arrivalMaterialPhoto?: string | null;
  arrivalMaterialPhoto1?: string | null;
  arrivalMaterialPhoto2?: string | null;
  arrivalLat?: number | null;
  arrivalLng?: number | null;
  status: TransportStatus;
  createdAt?: string;
  vehicle?: {
    id: number;
    plate: string;
    vehicleid?: string;
    brand?: string;
    model?: string;
    year?: number;
    driver?: {
      id?: number;
      name?: string | null;
      document?: string | null;
      phone?: string | null;
    } | null;
    capacity?: number;
    type?: VehicleTypeInput;
    company?: VehicleCompany | null;
  };
  owner?: {
    id: number;
    companyname: string;
    name: string;
  };
  client?: {
    id: number;
    companyname: string;
    name: string;
  };
  constSite?: {
    id: number;
    name: string;
  };
  planning?: {
    id: number;
    name: string;
  };
  material?: {
    id: number;
    materialType: string;
  };
  user?: {
    id: number;
    name: string;
  };
}

export interface TransportDepartureData {
  vehicleId?: number;
  ownerId?: number;
  clientId?: number;
  constSiteId?: number;
  planningId?: number;
  materialId?: number;
  departureM3?: number;
  departureLat?: number;
  departureLng?: number;
  driverFile?: File;
  vehicleFile?: File;
  plateFile?: File;
  materialFile?: File;
}

export interface TransportArrivalData {
  arrivalM3?: number;
  arrivalLat?: number;
  arrivalLng?: number;
  abscisa?: string;
  driverFile?: File | null;
  vehicleFile?: File | null;
  plateFile?: File | null;
  materialFile?: File | null;
}

export interface TransportCorrectionData {
  departureM3Corrected?: number;
  arrivalM3Corrected?: number;
  observation?: string;
}

export interface TransportQrVehicle {
  id: number;
  vehicleid?: string;
  plate?: string;
  brand?: string;
  model?: string;
  driver?: {
    id?: number;
    name?: string | null;
    document?: string | null;
    phone?: string | null;
  } | null;
  capacity?: number;
  owner?: {
    id: number;
    companyname: string;
    name: string;
  };
}

export type TransportQrResponse =
  | {
    action: 'CONTINUE_TO_ARRIVAL';
    transportId: number;
    data: TransportLog;
  }
  | {
    action: 'CREATE_DEPARTURE';
    vehicle: TransportQrVehicle;
  };
