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
}

export interface VentaOrden {
  id: number;
  codigo: string;
  clientId: number;
  constSiteId: number;
  estado: VentaOrdenEstado;
  observacion: string | null;
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
  items: VentaOrdenItemFormData[];
}

export interface VentaOrdenFilters {
  clientId?: number;
  constSiteId?: number;
  estado?: VentaOrdenEstado;
  isActive?: boolean;
}
