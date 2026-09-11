/**
 * Venta de cantera: despacho de material vendido.
 *
 * No es una variante de TransportLog. No tiene llegada, ni emparejamiento, ni
 * desviación de m³, ni planificación, ni descuento de stock — en el punto de
 * venta no se lleva saldo asignado. Por eso el módulo es independiente.
 */
export interface VentaCantera {
  id: number;
  uuid: string;
  userId: number;
  canteraId: number;
  qrcode: string;

  /** Lo que tecleó el supervisor. Siempre presente. */
  vehicleIdText: string;
  /** Null cuando no se pudo resolver contra el catálogo: el registro se guarda
   *  igual (el camión ya salió) y queda marcado para completar desde acá. */
  vehicleId: number | null;

  /** Foto del momento del despacho: el vehículo puede cambiar de chofer. */
  plate: string | null;
  driverName: string | null;

  materialId: number;
  m3: number;
  comprador: string | null;
  observation: string | null;

  lat: number | null;
  lng: number | null;

  /** Hora real del despacho, no la de sincronización. */
  capturedAt: string;
  createdAt: string;
  updatedAt?: string;
  isActive: boolean;

  platePath: string | null;
  materialPath: string | null;
  driverPath: string | null;
  vehiclePath: string | null;

  cantera?: {
    id: number;
    nombre: string | null;
    materialProvider?: { id: number; razonsocial: string | null } | null;
  } | null;

  vehicle?: {
    id: number;
    vehicleid: string;
    plate: string;
    brand?: string | null;
    model?: string | null;
    /** INTERNO | EXTERNO. Viene del join, no se guarda en la venta. */
    type?: string | null;
    company?: string | null;
    capacity?: number | null;
  } | null;

  material?: { id: number; materialType: string } | null;
  user?: { id: number; name: string } | null;
}

/** QR de venta de una cantera. Su existencia es lo que la marca como punto de venta. */
export interface VentaQr {
  id: number;
  canteraId: number;
  qrcode: string;
  url: string;
  isActive: boolean;
  cantera?: {
    id: number;
    nombre: string | null;
    provincia?: string | null;
    canton?: string | null;
    materialProvider?: { id: number; razonsocial: string | null } | null;
  } | null;
}

export interface VentaFilters {
  canteraId?: number;
  vehicleId?: number;
  materialId?: number;
  /** Ambas se comparan contra capturedAt. */
  desde?: string;
  hasta?: string;
}

export interface UpdateVentaData {
  m3?: number;
  comprador?: string | null;
  observation?: string | null;
}

export interface VentaConsumoGrupo {
  id: number | string;
  etiqueta: string;
  m3: number;
  viajes: number;
}

/**
 * Solo consumo. No hay bloque de stock porque no hay saldo asignado contra el
 * cual comparar en un punto de venta.
 */
export interface VentaConsumoReport {
  totales: { viajes: number; m3: number };
  porCantera: VentaConsumoGrupo[];
  porMaterial: VentaConsumoGrupo[];
  porVehiculo: VentaConsumoGrupo[];
  movimientos: VentaCantera[];
}
