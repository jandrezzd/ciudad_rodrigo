import { VehicleCompany, VehicleTypeInput } from '@/modules/vehicles/types';

export type TransportStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'ALERTA'
  | 'REVISADO'
  | 'VALIDADO'
  /** Salida abierta hace más de 24 h sin una llegada que la cierre. Solo es
   *  una señal de atención: sigue siendo candidata del emparejamiento. */
  | 'PENDIENTE_EMPAREJAMIENTO';

export interface TransportLog {
  id: number;
  /** Código correlativo del viaje, ej. TRA-00001-2026. */
  codigo?: string | null;
  userId: number;
  userArrivalId?: number | null;
  vehicleId: number;
  ownerId?: number | null;
  clientId?: number | null;
  constSiteId?: number | null;
  planningId?: number | null;
  materialId?: number | null;
  /** Cantera de la que salió el material: define a qué stock se descuenta */
  canteraId?: number | null;
  cantera?: {
    id: number;
    nombre: string;
    materialProvider?: { id: number; ruc: string; razonsocial: string };
  } | null;
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
  /** Observación escrita por el supervisor de cantera al registrar la salida */
  departureObservation?: string | null;
  arrivalAt?: string | null;
  arrivalM3?: number | null;
  arrivalM3Corrected?: number | null;
  deviationM3?: number | null;
  /** Observación escrita por el supervisor de obra al registrar la llegada */
  arrivalObservation?: string | null;
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
  initialStatus?: TransportStatus | null;
  /** Registro de la app guardado pese a una validación (ej. vehículo inactivo). */
  motivoRevision?: string | null;
  /** Salida a pocos minutos de otra del mismo vehículo: la decide un ADMIN. */
  posibleDuplicado?: boolean;
  createdAt?: string;
  driverId?: number | null;
  /** Conductor asignado al vehículo en el momento en que se registró este viaje (no cambia si luego se reasigna el vehículo). */
  driver?: {
    id?: number;
    name?: string | null;
    document?: string | null;
    phone?: string | null;
  } | null;
  /** true si el chofer se fue a almorzar en algún punto de este viaje (1h fija descontada al emparejar). */
  almuerzoAplicado?: boolean;
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
  numeroFactura?: string;
  planning?: {
    id: number;
    /** Ej. PLAN-0002-2026. */
    planningCode?: string;
    name?: string;
    numeroFactura?: string;
    canteras?: Array<{
      cantera?: {
        id: number;
        nombre?: string;
        materialProvider?: {
          id: number;
          razonsocial?: string;
        };
      };
    }>;
  };
  material?: {
    id: number;
    materialType: string;
  };
  user?: {
    id: number;
    name: string;
  };
  userArrival?: {
    id: number;
    name: string;
  } | null;
  /** Quién emparejó a mano esta salida con su llegada — null si lo hizo el
   *  barrido automático de reconciliación (o si nunca pasó por ese proceso). */
  matchedBy?: { id: number; name: string } | null;
  matchedAt?: string | null;
  /** Quién corrigió el material del despacho por última vez, y cuándo. */
  materialCorregidoPor?: { id: number; name: string } | null;
  materialCorregidoEn?: string | null;
}

export interface TransportDepartureData {
  vehicleId?: number;
  ownerId?: number;
  clientId?: number;
  constSiteId?: number;
  planningId?: number;
  materialId?: number;
  /**
   * Opcional: si no se envía, el backend la deduce del vehículo en su
   * planificación, o de la única cantera de esa planificación.
   */
  canteraId?: number;
  departureM3?: number;
  departureLat?: number;
  departureLng?: number;
  /**
   * Momento real de la salida, en ISO. Si no se envía, el backend estampa la
   * hora del servidor — que para un registro que se está reponiendo a mano es
   * la hora equivocada, y deja la salida inemparejable con su llegada real.
   */
  capturedAt?: string;
  /** Idempotencia: mismo uuid en los reintentos = un solo viaje creado. */
  uuid?: string;
  driverFile?: File;
  vehicleFile?: File;
  plateFile?: File;
  materialFile?: File;
}

/** Alta manual de una llegada huérfana: POST /transport/pending-arrival. */
export interface CreatePendingArrivalData {
  vehicleId: number;
  /** Momento real de la llegada, en ISO. */
  capturedAt: string;
  m3: number;
  m3Corrected?: number;
  abscisa?: number;
  almuerzo?: boolean;
  reason: string;
}

export interface TransportArrivalData {
  arrivalM3?: number;
  arrivalLat?: number;
  arrivalLng?: number;
  abscisa?: string;
  /** Momento real de la llegada, en ISO. Sin esto el backend usa la hora del servidor. */
  capturedAt?: string;
  /** Idempotencia: mismo uuid en los reintentos = una sola llegada registrada. */
  uuid?: string;
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

/** Fila de GET /transport/pending-arrivals: llegada sincronizada sin salida conocida todavía. */
export interface PendingArrivalRow {
  id: number;
  /** EN_REVISION = liberada por un ADMIN al desemparejar; el automático la
   *  ignora a propósito y espera que se empareje a mano. */
  status: 'PENDIENTE' | 'EXPIRADO' | 'EN_REVISION';
  /** Null si el QR escaneado no corresponde a ningún vehículo. */
  vehicleId: number | null;
  plate: string | null;
  vehicleCode: string | null;
  motivoRevision?: string | null;
  qrcode?: string | null;
  departureUuid?: string | null;
  capturedAt: string;
  receivedAt: string;
  m3: number;
  m3Corrected?: number | null;
  abscisa?: number | null;
  almuerzo: boolean;
  registradoPor?: string | null;
  /** Planificaciones del vehículo (la llegada no guarda la suya). */
  plannings?: { id: number; planningCode: string; obra: string | null }[];
}

export interface ReassignTripData {
  vehicleId?: number;
  driverId?: number;
  reason: string;
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
