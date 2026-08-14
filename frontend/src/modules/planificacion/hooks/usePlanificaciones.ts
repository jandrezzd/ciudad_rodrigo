import { useState, useEffect, useCallback } from 'react';
import { planificacionService } from '../services/planificacionService';
import { Planificacion, PlanningVehicleAsignado } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const usePlanificaciones = () => {
  const [planificaciones, setPlanificaciones] = useState<Planificacion[]>([]);
  const [allPlanificaciones, setAllPlanificaciones] = useState<Planificacion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlanificaciones = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await planificacionService.getAll();
      const rawList = Array.isArray(response) ? response : response.data || [];
      const normalized = rawList.map((planning) => {
        const asignaciones = Array.isArray(planning.vehicles)
          ? (planning.vehicles as unknown as PlanningVehicleAsignado[])
          : [];
        const vehicles = asignaciones
          .map((pv) => pv.vehicle)
          .filter(Boolean) as NonNullable<Planificacion['vehicles']>;

        // El aplanado a `vehicles` pierde el canteraId de cada asignación; se
        // conserva aparte para que al editar no se borre lo ya asignado.
        const vehicleCanteras = asignaciones
          .map((pv) => ({
            vehicleId: String(pv.vehicleId ?? pv.vehicle?.id ?? ''),
            canteraId: pv.canteraId != null ? String(pv.canteraId) : null,
          }))
          .filter((vc) => vc.vehicleId !== '');

        return {
          id: String(planning.id),
          planningCode: planning.planningCode,
          description: planning.description,
          clientId: String(planning.clientId),
          constSiteId: String(planning.constSiteId),
          client: planning.client,
          constSite: planning.constSite,
          startDate: planning.startDate,
          endDate: planning.endDate,
          status: planning.status,
          vehicleIds: vehicles.map((vehicle: { id: number }) => String(vehicle.id)),
          vehicles,
          vehicleCanteras,
          isActive: planning.isActive,
          proveedorId: planning.proveedorId ? String(planning.proveedorId) : undefined,
          canteraIds: Array.isArray(planning.canteras) 
            ? planning.canteras.map((c: any) => String(c.canteraId)) 
            : [],
          canteras: planning.canteras,
          numeroFactura: planning.numeroFactura,
          invoicePath: planning.invoicePath,
          facturaUrl: planning.facturaUrl,
          createdAt: planning.createdAt,
          updatedAt: planning.updatedAt,
        };
      });
      const activeNormalized = normalized.filter((planning) => planning?.isActive !== false);
      setPlanificaciones(sortByNewest(activeNormalized));
      setAllPlanificaciones(sortByNewest(normalized));
    } catch (err) {
      const errorMessage = 'Error al cargar planificaciones';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlanificaciones();
  }, [fetchPlanificaciones]);

  return {
    planificaciones,
    allPlanificaciones,
    isLoading,
    error,
    refetch: fetchPlanificaciones,
  };
};
