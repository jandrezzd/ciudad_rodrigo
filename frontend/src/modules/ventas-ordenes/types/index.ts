/**
 * Órdenes de venta: pedido de un cliente para una de sus obras, con N líneas
 * de material y su saldo. Refleja el shape exacto de `formatOrden()` en
 * `backend/src/ventas/ventas-ordenes.service.ts`.
 */
export type VentaOrdenEstado = 'ABIERTA' | 'COMPLETADA' | 'CERRADA' | 'CANCELADA';

export interface VentaOrdenItem {
  id: number;
  ordenId: number;
  materialId: number;
  m3Asignados: number;
  material?: { id: number; materialType: string } | null;
  /** Calculados por el backend, solo lectura: nunca se guarda un saldo aparte. */
  despachadoM3: number;
  disponibleM3: number;
  excedido: boolean;
  /** Cada despacho real registrado contra esta línea — placa, m³ y hora. Para
   *  el reporte PDF de la orden (no para el saldo, que ya viene calculado). */
  despachos: { codigo?: string | null; plate: string; m3: number; capturedAt: string }[];
}

/** Vehículo asignado a una orden. */
export interface VehiculoOrden {
  id: number;
  vehicleid: string;
  plate: string;
  capacity: number;
  type: 'INTERNO' | 'EXTERNO';
}

export interface VentaOrden {
  id: number;
  codigo: string;
  clientId: number;
  constSiteId: number;
  estado: VentaOrdenEstado;
  observacion: string | null;
  /** ABC-0000. Formato viejo, solo informativo; las órdenes nuevas usan `vehiculos`. */
  placas: string[];
  vehiculos?: VehiculoOrden[];
  fechaApertura: string;
  fechaCierre: string | null;
  motivoCierre: string | null;
  cerradaPorId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  client: {
    id: number;
    name: string;
    companyname: string;
    ruc: string | null;
    type: 'PUBLICO' | 'PRIVADO';
  };
  constSite: {
    id: number;
    name: string;
    province: string | null;
    canton: string | null;
  };
  cerradaPor?: { id: number; name: string } | null;
  /** Última persona que editó la orden desde la web, y cuándo — no un
   *  historial completo, solo la edición más reciente. */
  editadoPor?: { id: number; name: string } | null;
  editadoEn?: string | null;
  editadoMaterial?: string | null;

  items: VentaOrdenItem[];
  totales: { asignadoM3: number; despachadoM3: number; disponibleM3: number };
}

export interface VentaOrdenItemFormData {
  materialId: string;
  m3Asignados: string;
}

export interface VentaOrdenFormData {
  clientId: string;
  constSiteId: string;
  observacion: string;
  /** Placas viejas (texto). Ya no se editan; se conservan al guardar. */
  placas: string;
  vehiculos: VehiculoOrden[];
  items: VentaOrdenItemFormData[];
}

export interface ResolverVehiculoData {
  clientId: number;
  plate: string;
  capacity: number;
  /** Solo para crear un vehículo de la empresa (cliente privado). */
  vehicleid?: string;
  company?: 'CIUDAD_RODRIGO' | 'TRANSVELEZ';
}

export interface VentaOrdenFilters {
  clientId?: number;
  constSiteId?: number;
  estado?: VentaOrdenEstado;
  isActive?: boolean;
}
