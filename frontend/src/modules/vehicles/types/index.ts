// Tipos alineados con el backend (DTO: CreateVehicleDto)
// Backend fields: plate, brand, model, year, type (INTERNO|EXTERNO), company, capacity, observation (optional), ownerId

export type VehicleType = 'INTERNO' | 'EXTERNO';
export type VehicleTypeInput = VehicleType | 'INTERNAL' | 'EXTERNAL' | '' | null | undefined;

export type VehicleCompany = 'CIUDAD_RODRIGO' | 'TRANSVELEZ';

export const VEHICLE_COMPANY_LABELS: Record<VehicleCompany, string> = {
  CIUDAD_RODRIGO: 'Ciudad Rodrigo',
  TRANSVELEZ: 'Transvelez',
};

export const normalizeVehicleType = (value?: VehicleTypeInput): VehicleType | '' => {
  const upper = (value ?? '').toString().toUpperCase().trim();
  if (!upper) return '';
  if (upper === 'INTERNAL') return 'INTERNO';
  if (upper === 'EXTERNAL') return 'EXTERNO';
  if (upper === 'INTERNO' || upper === 'EXTERNO') return upper as VehicleType;
  return '';
};

export const inferVehicleCompany = (value?: string | null): VehicleCompany | null => {
  const raw = (value ?? '').toString().trim();
  if (!raw) return null;
  const normalized = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]/g, '');

  if (!normalized) return null;

  if (
    normalized.includes('CIUDADRODRIGO') ||
    (normalized.includes('CIUDAD') && normalized.includes('RODRIGO')) ||
    normalized.includes('TCR')
  ) {
    return 'CIUDAD_RODRIGO';
  }

  if (
    normalized.includes('TRANSVELEZ') ||
    normalized.includes('TRANVELEZ') ||
    normalized.includes('TRANVELEZZ') ||
    normalized.includes('TRANSVELEZZ') ||
    (normalized.includes('TRANS') && normalized.includes('VELEZ')) ||
    (normalized.includes('TRAN') && normalized.includes('VELEZ')) ||
    normalized.includes('TVL')
  ) {
    return 'TRANSVELEZ';
  }

  return null;
};

export interface VehicleQRCode {
  id: number;
  qrcode: string;
  url: string;
  status: 'DISPONIBLE' | 'OCUPADO';
}

export interface Driver {
  id: number;
  name?: string | null;
  document?: string | null;
  phone?: string | null;
}

export interface Vehicle {
  id: number;
  vehicleid: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  qrcodeId?: number | null;
  qrcode?: VehicleQRCode | null;
  type: VehicleType;
  capacity: number;
  company?: VehicleCompany | null;
  driverId?: number | null;
  driver?: Driver | null;
  observation?: string;
  ownerId: number;
  isActive?: boolean;
  owner?: {
    id: number;
    name: string;
    companyname: string;
    ruc: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleFormData {
  vehicleid: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  qrcodeId?: number | null;
  type: VehicleType | '';
  capacity: string | number;
  company?: VehicleCompany | null;
  driverId: number | null;
  observation?: string;
  ownerId: number;
  isActive?: boolean;
}
