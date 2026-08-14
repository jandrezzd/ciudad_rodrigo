/** Mismo criterio que el módulo de vehículos: INTERNO = propio, EXTERNO = tercero */
export type ProveedorMaterialTipo = 'INTERNO' | 'EXTERNO';

export const PROVEEDOR_MATERIAL_TIPO_LABELS: Record<ProveedorMaterialTipo, string> = {
  INTERNO: 'Interno',
  EXTERNO: 'Externo',
};

/**
 * Sentido en que se aplica el factor de conversión:
 * TN_A_M3 divide (M³ = TN ÷ factor) y M3_A_TN multiplica (TN = M³ × factor).
 */
export type ConversionDireccion = 'TN_A_M3' | 'M3_A_TN';

export const CONVERSION_DIRECCION_LABELS: Record<ConversionDireccion, string> = {
  TN_A_M3: 'TN → M³',
  M3_A_TN: 'M³ → TN',
};

export const CONVERSION_DIRECCION_AYUDA: Record<ConversionDireccion, string> = {
  TN_A_M3: 'Ingrese las toneladas; se dividen por el factor para obtener los M³',
  M3_A_TN: 'Ingrese los metros cúbicos; se multiplican por el factor para obtener las TN',
};

/** Material que despacha una cantera, con la cantidad asignada y su equivalencia TN/M³ */
export interface CanteraMaterial {
  id?: number;
  materialId: number;
  /** Cantidad asignada en toneladas (TN) */
  toneladas?: number;
  /** Cantidad asignada en metros cúbicos (M3) */
  metrosCubicos?: number;
  /** Factor de conversión TN por M3 (toneladas / metros cúbicos) */
  factor?: number;
  /** Sentido en que se cargó la conversión */
  direccionConversion?: ConversionDireccion;

  /** Catálogo de materiales, incluido por el backend */
  material?: { id: number; materialType: string };

  // Saldos calculados por el backend a partir del libro mayor (solo lectura)
  consumidoM3?: number;
  consumidoToneladas?: number;
  disponibleM3?: number;
  disponibleToneladas?: number;
  /** Se despachó más de lo asignado */
  excedido?: boolean;
}

/** Un despacho registrado contra el stock de una cantera */
export interface CanteraMovimiento {
  id: number;
  canteraMaterialId: number;
  tripId?: number | null;
  m3: number;
  toneladas?: number | null;
  tipo: 'SALIDA' | 'AJUSTE' | 'REVERSA';
  motivo?: string | null;
  /** Momento real del despacho, no el de sincronización */
  capturedAt: string;
  canteraMaterial?: {
    id: number;
    materialId: number;
    material?: { id: number; materialType: string };
  };
  trip?: {
    id: number;
    uuid: string;
    planningId?: number | null;
    departureAt: string;
    status: string;
    vehicle?: { id: number; vehicleid: string; plate: string };
  } | null;
}

export interface ConductorRef {
  id: number;
  name?: string | null;
  document?: string | null;
  phone?: string | null;
}

/** Un despacho con todo su detalle de auditoría */
export interface MovimientoDetallado extends CanteraMovimiento {
  /** Quien manejó en ese viaje (foto tomada al registrar la salida) */
  conductorViaje?: ConductorRef | null;
  /** Quien está asignado al vehículo hoy */
  conductorActual?: ConductorRef | null;
  /** El conductor del viaje ya no es el asignado al vehículo */
  cambioDeConductor?: boolean;
  canteraMaterial?: CanteraMovimiento['canteraMaterial'] & {
    cantera?: { id: number; nombre: string; materialProviderId: number };
  };
  trip?:
    | (NonNullable<CanteraMovimiento['trip']> & {
        arrivalAt?: string | null;
        deviationM3?: number | null;
        driver?: ConductorRef | null;
        planning?: { id: number; planningCode: string } | null;
        constSite?: { id: number; name: string } | null;
        client?: { id: number; companyname: string } | null;
        departure?: { m3: number; m3Corrected?: number | null; capturedAt: string; source: string } | null;
        arrival?: { m3: number; m3Corrected?: number | null; capturedAt: string } | null;
        vehicle?: {
          id: number;
          vehicleid: string;
          plate: string;
          brand?: string;
          model?: string;
          type?: string;
          company?: string | null;
          driver?: ConductorRef | null;
          owner?: { id: number; companyname: string } | null;
        };
      })
    | null;
}

/** Resumen de un vehículo dentro del historial de un proveedor */
export interface VehiculoHistorial {
  vehicleId: number;
  vehicleid: string;
  plate: string;
  marca?: string;
  modelo?: string;
  tipo?: string;
  empresa?: string | null;
  viajes: number;
  totalM3: number;
  totalToneladas: number;
  conductores: (ConductorRef & { viajes: number; totalM3: number })[];
  /** Más de un conductor manejó este vehículo en el período */
  tuvoCambioDeConductor: boolean;
}

export interface HistorialProveedor {
  proveedor: {
    id: number;
    ruc: string;
    razonsocial: string;
    nombreComercial?: string | null;
  };
  movimientos: MovimientoDetallado[];
  vehiculos: VehiculoHistorial[];
  totales: { m3: number; toneladas: number; viajes: number };
}

export interface HistorialFiltros {
  canteraId?: number;
  planningId?: number;
  desde?: string;
  hasta?: string;
}

/** Saldos consolidados de un proveedor completo */
export interface ProveedorSaldos {
  id: number;
  ruc: string;
  razonsocial: string;
  nombreComercial?: string | null;
  canteras: Cantera[];
  totales: {
    asignadoM3: number;
    asignadoToneladas: number;
    consumidoM3: number;
    consumidoToneladas: number;
    disponibleM3: number;
    disponibleToneladas: number;
  };
}

/** Respuesta de saldos de una cantera */
export interface CanteraSaldos extends Cantera {
  materialProvider?: {
    id: number;
    ruc: string;
    razonsocial: string;
    nombreComercial?: string | null;
  };
  materiales: CanteraMaterial[];
}

export interface Cantera {
  id?: number;
  nombre: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  /** Una cantera puede despachar varios materiales */
  materiales?: CanteraMaterial[];
  materialProviderId?: number;
}

export interface ProveedorMaterial {
  id: number;
  ruc: string;
  /** El backend retorna este campo como 'razonsocial' (en minúscula) */
  razonsocial: string;
  nombreComercial?: string;
  /** Obligatorio en la base: INTERNO = cantera propia, EXTERNO = tercero */
  tipo: ProveedorMaterialTipo;
  email: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  isActive?: boolean;
  canteras: Cantera[];
  createdAt?: string;
  updatedAt?: string;
}

/** Los importes se manejan como texto en el formulario para no pelear con el input vacío */
export interface CanteraMaterialFormData {
  materialId: number;
  toneladas: string;
  metrosCubicos: string;
  factor: string;
  direccionConversion: ConversionDireccion;
}

/**
 * Campos numéricos de la tabla. Cuál se puede editar depende de la dirección:
 * el campo de destino siempre se calcula.
 */
export type CanteraMaterialCampo = 'toneladas' | 'metrosCubicos' | 'factor';

export interface CanteraFormData {
  /** Presente al editar: conserva el id de la cantera y su historial */
  id?: number;
  nombre: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  materiales: CanteraMaterialFormData[];
}

export interface ProveedorMaterialFormData {
  ruc: string;
  razonsocial: string;
  nombreComercial?: string;
  /** Cadena vacía = aún no seleccionado (el select lo exige antes de enviar) */
  tipo: ProveedorMaterialTipo | '';
  email: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  canteras: CanteraFormData[];
}
