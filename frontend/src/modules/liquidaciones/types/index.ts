import { VehicleCompany, VehicleTypeInput } from '@/modules/vehicles/types';
import type { UbicacionLlegada } from '@/modules/registro-transporte/types';

export type TransportStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO'
  | 'ALERTA'
  | 'REVISADO'
  | 'VALIDADO';

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
  arrivalGpsPrecisionM?: number | null;
  ubicacionLlegada?: UbicacionLlegada | null;
  status: TransportStatus;
  createdAt?: string;
  driverId?: number | null;
  /** Conductor asignado al vehículo en el momento en que se registró este viaje (no cambia si luego se reasigna el vehículo). */
  driver?: {
    id?: number;
    name?: string | null;
    document?: string | null;
    phone?: string | null;
  } | null;
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
    /** Ej. PLAN-0002-2026. */
    planningCode?: string;
    canteras?: { cantera?: { nombre?: string | null } | null }[];
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
  /** Liquidación en la que está el viaje (solo en GET /liquidaciones/viajes/:id). */
  liquidacion?: { id: number; codigo: string } | null;
  /** Nota propia del liquidador (separada de observation, que lleva notas del sistema). */
  notaLiquidador?: string | null;
  notaLiquidadorEn?: string | null;
  notaLiquidadorPor?: { id: number; name: string } | null;
}

// ─── Liquidaciones (backend /liquidaciones) ────────────────────────────────

export interface ObraResumen {
  id: number;
  name: string;
  province?: string | null;
  canton?: string | null;
}

export interface ClienteResumen {
  id: number;
  name: string;
  companyname: string | null;
  ruc?: string;
}

export type EstadoLiquidacion = 'ACTIVA' | 'ANULADA';

export interface UsuarioResumen {
  id: number;
  name: string;
}

/** Fila del historial (GET /liquidaciones). */
export interface LiquidacionResumen {
  id: number;
  codigo: string;
  obra: ObraResumen;
  cliente: ClienteResumen;
  montoTotal: number;
  /** AAAA-MM-DD */
  fecha: string;
  cantidadViajes: number;
  estado: EstadoLiquidacion;
  editadoEn: string | null;
  anuladaEn: string | null;
}

/** Viaje dentro de una liquidación, con su precio. */
export interface LiquidacionViaje {
  tripId: number;
  codigo: string | null;
  placa: string | null;
  vehicleid: string | null;
  conductor: string | null;
  /** Nombre de la cantera de salida. Ausente en fotos de anulación antiguas. */
  cantera?: string | null;
  material: string | null;
  salida: string | null;
  llegada: string | null;
  m3Salida: number | null;
  m3Llegada: number | null;
  notaLiquidador?: string | null;
  /** Precio unitario por m³. */
  precio: number;
  /** m³ de llegada usados en el subtotal. Ausente en fotos de anulación antiguas. */
  m3?: number;
  /** m3 × precio. Ausente en fotos de anulación antiguas. */
  subtotal?: number;
}

/** Solo trae las claves que cambiaron en esa edición. */
export interface CambiosLiquidacion {
  /** antes/despues: precios unitarios. m3 y subtotales desde el 2026-11-23. */
  precios?: {
    tripId: number;
    codigo: string | null;
    antes: number;
    despues: number;
    m3?: number;
    subtotalAntes?: number;
    subtotalDespues?: number;
  }[];
  quitados?: { tripId: number; codigo: string | null; precio: number; m3?: number; subtotal?: number }[];
  fecha?: { antes: string; despues: string };
  observacion?: { antes: string | null; despues: string | null };
  montoTotal?: { antes: number; despues: number };
  anulada?: { viajes: number; montoTotal: number };
}

export interface LiquidacionEdicion {
  id: number;
  usuario: UsuarioResumen | null;
  fecha: string;
  motivo: string;
  cambios: CambiosLiquidacion;
}

/** Detalle completo (GET /liquidaciones/:id). */
export interface LiquidacionDetalle {
  id: number;
  codigo: string;
  /** AAAA-MM-DD */
  fecha: string;
  montoTotal: number;
  observacion: string | null;
  estado: EstadoLiquidacion;
  obra: ObraResumen;
  cliente: ClienteResumen;
  creadoPor: UsuarioResumen;
  createdAt: string;
  editadoPor: UsuarioResumen | null;
  editadoEn: string | null;
  anuladaPor: UsuarioResumen | null;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  /** En una anulada: los viajes como estaban al anularla. */
  viajes: LiquidacionViaje[];
  ediciones: LiquidacionEdicion[];
}

export interface ViajePrecio {
  tripId: number;
  precio: number;
}

export interface CrearLiquidacionPayload {
  constSiteId: number;
  clientId: number;
  fecha?: string;
  observacion?: string;
  viajes: ViajePrecio[];
}

export interface EditarLiquidacionPayload {
  motivo: string;
  fecha?: string;
  observacion?: string | null;
  viajes?: ViajePrecio[];
}

export interface FiltrosViajesLiquidables {
  /** Vacío = sin rango: todos los pendientes (el backend devuelve hasta 500). */
  desde?: string;
  hasta?: string;
  constSiteId?: number;
  clientId?: number;
  /** Planificación del viaje (ya define obra, cliente y canteras). */
  planningId?: number;
}

export interface FiltrosLiquidaciones {
  desde?: string;
  hasta?: string;
  constSiteId?: number;
  clientId?: number;
  estado?: EstadoLiquidacion;
  codigo?: string;
}
