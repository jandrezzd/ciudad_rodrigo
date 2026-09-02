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
  /** Cantera asignada a cada vehículo; se pierde al aplanar `vehicles` */
  vehicleCanteras?: VehicleCantera[];
  vehicleStats?: VehicleStats;
  isActive?: boolean;
  proveedorId?: string;
  canteraIds?: string[];
  canteras?: any[];
  numeroFactura?: string;
  invoicePath?: string;
  facturaUrl?: string;
  /** Informativa: NUNCA se usa en el cálculo de emparejamiento de viajes. */
  distanciaAproximadaKm?: number | null;
  /** Minutos. Informativo: el algoritmo de reconciliación empareja por menor
   *  diferencia de tiempo entre salida y llegada, ya no depende de este campo. */
  tiempoPromedioViajeMin?: number | null;
  createdAt: string;
  updatedAt?: string;
}

/** Cantera desde la que despacha un vehículo dentro de la planificación */
export interface VehicleCantera {
  vehicleId: string;
  canteraId: string | null;
}

/** Lo que devuelve GET /plannings/:id/vehicles */
export interface PlanningVehicleAsignado {
  id: number;
  planningId: number;
  vehicleId: number;
  canteraId?: number | null;
  vehicle?: Vehicle;
  cantera?: { id: number; nombre: string } | null;
}

/** Consumo de un material en una cantera dentro de una planificación */
export interface ConsumoMaterialItem {
  canteraMaterialId: number;
  materialId: number;
  material?: { id: number; materialType: string };
  factor?: number | null;
  asignadoM3: number;
  asignadoToneladas: number;
  /** Solo de esta planificación */
  consumidoEnPlanificacionM3: number;
  consumidoEnPlanificacionToneladas: number;
  /** De todas las planificaciones que usan esta cantera */
  consumidoTotalM3: number;
  consumidoTotalToneladas: number;
  disponibleM3: number;
  disponibleToneladas: number;
  excedido: boolean;
  viajes: number;
}

export interface ConsumoMaterialPlanificacion {
  planningId: number;
  planningCode: string;
  canteras: {
    canteraId: number;
    nombre: string;
    materialProvider?: {
      id: number;
      ruc: string;
      razonsocial: string;
      nombreComercial?: string | null;
    };
    materiales: ConsumoMaterialItem[];
  }[];
  totales: { consumidoM3: number; consumidoToneladas: number; viajes: number };
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
  /**
   * Solo hace falta cuando la planificación tiene más de una cantera: con una
   * sola, el backend se la asigna a todos los vehículos.
   */
  vehicleCanteras?: VehicleCantera[];
  /** Informativa: NUNCA se usa en el cálculo de emparejamiento de viajes. */
  distanciaAproximadaKm?: string;
  /**
   * En HORAS para que el usuario lo capture cómodamente (ej. "2.33" = 2h20).
   * El servicio lo convierte a minutos (tiempoPromedioViajeMin) al enviarlo.
   */
  tiempoPromedioViajeHoras?: string;
}
