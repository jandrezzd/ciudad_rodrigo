import axiosInstance from '@/config/axios';
import { parsePlacasOrden } from '@/shared/utils/validation';
import {
  ResolverVehiculoData,
  VehiculoOrden,
  VentaOrden,
  VentaOrdenFilters,
  VentaOrdenFormData,
} from '../types';

/** El backend a veces envuelve en { data }; mismo desempaquetado defensivo que
 *  usa ventasService. */
const unwrap = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const unwrapList = <T,>(payload: unknown): T[] => {
  const data = unwrap<T[]>(payload);
  return Array.isArray(data) ? data : [];
};

/** El backend rechaza líneas con m3Asignados <= 0 o materiales repetidos, así
 *  que solo se manda lo que ya pasó esa validación en el formulario. */
const toItemsPayload = (data: VentaOrdenFormData) =>
  data.items.map((item) => ({
    materialId: Number(item.materialId),
    m3Asignados: Number(item.m3Asignados.replace(',', '.')),
  }));

export const ventaOrdenesService = {
  getAll: async (filters: VentaOrdenFilters = {}): Promise<VentaOrden[]> => {
    const response = await axiosInstance.get('ventas/ordenes', { params: filters });
    return unwrapList<VentaOrden>(response.data);
  },

  getById: async (id: number): Promise<VentaOrden> => {
    const response = await axiosInstance.get(`ventas/ordenes/${id}`);
    return unwrap<VentaOrden>(response.data);
  },

  /** clientId y constSiteId no son editables después de creada la orden. */
  create: async (data: VentaOrdenFormData): Promise<VentaOrden> => {
    const response = await axiosInstance.post('ventas/ordenes', {
      clientId: Number(data.clientId),
      constSiteId: Number(data.constSiteId),
      observacion: data.observacion.trim() || undefined,
      placas: parsePlacasOrden(data.placas).placas,
      vehicleIds: data.vehiculos.map((v) => v.id),
      items: toItemsPayload(data),
    });
    return unwrap<VentaOrden>(response.data);
  },

  /** Si se manda `items`, reemplaza el set completo de líneas (no es un merge). */
  update: async (
    id: number,
    data: Pick<VentaOrdenFormData, 'observacion' | 'placas' | 'vehiculos' | 'items'>
  ): Promise<VentaOrden> => {
    const response = await axiosInstance.patch(`ventas/ordenes/${id}`, {
      observacion: data.observacion.trim() || null,
      placas: parsePlacasOrden(data.placas).placas,
      vehicleIds: data.vehiculos.map((v) => v.id),
      items: data.items.map((item) => ({
        materialId: Number(item.materialId),
        m3Asignados: Number(item.m3Asignados.replace(',', '.')),
      })),
    });
    return unwrap<VentaOrden>(response.data);
  },

  /** Vehículo ya registrado con esa placa (o null), para autocompletar su cubicaje. */
  buscarVehiculo: async (plate: string): Promise<VehiculoOrden | null> => {
    const response = await axiosInstance.get('ventas/ordenes/vehiculo', {
      params: { plate },
    });
    // Si no existe, el backend responde un cuerpo vacío en vez de `null`.
    const vehiculo = unwrap<VehiculoOrden | null>(response.data);
    return vehiculo && typeof vehiculo === 'object' && 'id' in vehiculo ? vehiculo : null;
  },

  /** Busca por placa o crea el vehículo que se está agregando a la orden. */
  resolverVehiculo: async (data: ResolverVehiculoData): Promise<VehiculoOrden> => {
    const response = await axiosInstance.post('ventas/ordenes/vehiculo', data);
    return unwrap<VehiculoOrden>(response.data);
  },

  /** Botón "Enviar a Telegram" de la edición: reenvía el estado actual a los
   *  supervisores de cantera vinculados. No se usa al crear (eso es automático). */
  notificar: async (id: number): Promise<{ enviados: number }> => {
    const response = await axiosInstance.post(`ventas/ordenes/${id}/notificar`);
    return unwrap<{ enviados: number }>(response.data);
  },

  /** Cierre manual. El motivo es obligatorio (mínimo 3 caracteres) del lado del backend. */
  cerrar: async (id: number, motivo: string): Promise<VentaOrden> => {
    const response = await axiosInstance.post(`ventas/ordenes/${id}/cerrar`, { motivo });
    return unwrap<VentaOrden>(response.data);
  },

  /** Baja lógica. Rechaza si la orden ya tiene algún despacho. */
  remove: async (id: number): Promise<void> => {
    await axiosInstance.delete(`ventas/ordenes/${id}`);
  },
};
