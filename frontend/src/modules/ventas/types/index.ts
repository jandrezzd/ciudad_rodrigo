/**
 * Venta de cantera: despacho de material vendido.
 *
 * No es una variante de TransportLog. No tiene llegada, ni emparejamiento, ni
 * desviación de m³, ni planificación. Sí descuenta stock, pero del suyo propio
 * (VentaCanteraStock), no del saldo asignado por planificación al flujo
 * cantera->obra. Por eso el módulo es independiente.
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

  /** Obra y orden contra las que se descontó, si la venta vino de la cascada
   *  cliente→obra→orden→material. Null en despachos previos a ese cambio. */
  constSiteId: number | null;
  ordenId: number | null;
  constSite?: { id: number; name: string | null } | null;
  orden?: { id: number; codigo: string } | null;

  /** Cliente al que se le vendió. */
  compradorId: number | null;
  /** Nombre comercial del cliente al momento del despacho: es una copia, no la
   *  relación viva, así que no cambia si después renombran al cliente. */
  comprador: string | null;
  compradorCliente?: {
    id: number;
    name: string;
    companyname: string;
    ruc: string | null;
  } | null;

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
  ordenId?: number;
  /** Ambas se comparan contra capturedAt. */
  desde?: string;
  hasta?: string;
}

export interface UpdateVentaData {
  m3?: number;
  /** Se manda el id: el servidor rehace la copia del nombre. */
  compradorId?: number;
  observation?: string | null;
}

export interface VentaConsumoGrupo {
  id: number | string;
  etiqueta: string;
  m3: number;
  viajes: number;
}

/** Los m³ de un material que una cantera tiene para vender. */
export interface VentaStock {
  id: number;
  canteraId: number;
  materialId: number;
  m3Asignados: number;
  isActive: boolean;
  material?: { id: number; materialType: string } | null;

  /** Calculados por el backend, solo lectura. */
  asignadoM3: number;
  consumidoM3: number;
  disponibleM3: number;
  /** Se vendió más de lo asignado. Con la app offline la venta ya ocurrió: se
   *  registra y se marca, no se rechaza. */
  excedido: boolean;
}

export interface VentaStockCantera {
  id: number;
  nombre: string | null;
  provincia?: string | null;
  canton?: string | null;
  materialProvider?: {
    id: number;
    razonsocial: string | null;
    nombreComercial?: string | null;
  } | null;
  materiales: VentaStock[];
}

export interface VentaStockReport {
  canteras: VentaStockCantera[];
  totales: { asignadoM3: number; consumidoM3: number; disponibleM3: number };
}

export type VentaStockTipo = 'INGRESO' | 'SALIDA' | 'AJUSTE' | 'REVERSA';

export interface VentaStockMovimiento {
  id: number;
  stockId: number;
  ventaId: number | null;
  m3: number;
  tipo: VentaStockTipo;
  motivo: string | null;
  capturedAt: string;
  createdAt: string;
  stock?: {
    id: number;
    material?: { id: number; materialType: string } | null;
  } | null;
  user?: { id: number; name: string } | null;
  venta?: {
    id: number;
    vehicleIdText: string;
    plate: string | null;
    comprador: string | null;
  } | null;
}

export interface IngresoStockData {
  canteraId: number;
  materialId: number;
  m3: number;
  motivo?: string;
}

export interface VentaConsumoReport {
  totales: { viajes: number; m3: number };
  porCantera: VentaConsumoGrupo[];
  porMaterial: VentaConsumoGrupo[];
  porVehiculo: VentaConsumoGrupo[];
  /** Cuánto se le vendió a cada cliente. */
  porComprador: VentaConsumoGrupo[];
  /** Cuánto se despachó contra cada orden de venta. Las ventas sin orden quedan
   *  fuera del grupo, igual que las sin material quedan fuera de porMaterial. */
  porOrden: VentaConsumoGrupo[];
  /** Interna (PRIVADO) vs Externa (PUBLICO), según el tipo del cliente comprador. */
  porTipoCliente: VentaConsumoGrupo[];
  /** Saldo actual, no el del rango filtrado: un "disponible" de hace tres meses
   *  no sirve para decidir hoy. */
  stock: VentaStockReport;
  movimientos: VentaCantera[];
}
