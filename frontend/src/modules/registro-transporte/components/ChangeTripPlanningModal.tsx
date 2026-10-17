import { FormEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '@/shared/components/Button';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { usePlanificaciones } from '@/modules/planificacion/hooks/usePlanificaciones';
import { transportLogService } from '../services/transportLogService';
import { TransportLog } from '../types';

interface ChangeTripPlanningModalProps {
  trip: TransportLog;
  onDone: (updated: TransportLog) => void;
  onCancel: () => void;
}

/**
 * Corrige la planificación de un viaje registrado en la equivocada (ej. el
 * vehículo seguía en la planificación anterior). Solo ADMIN. Cambia obra,
 * cliente y cantera, y mueve el consumo de stock a la cantera nueva.
 */
export const ChangeTripPlanningModal = ({ trip, onDone, onCancel }: ChangeTripPlanningModalProps) => {
  const { planificaciones } = usePlanificaciones();
  const [planningId, setPlanningId] = useState('');
  const [canteraId, setCanteraId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Solo activas, sin la actual. Primero las que tienen asignado este vehículo.
  const opciones = useMemo(() => {
    const vehiculo = String(trip.vehicleId);
    return planificaciones
      .filter((p) => p.isActive !== false && p.status !== 'CANCELADO' && String(p.id) !== String(trip.planningId))
      .sort((a, b) => {
        const aTiene = a.vehicleIds?.includes(vehiculo) ? 0 : 1;
        const bTiene = b.vehicleIds?.includes(vehiculo) ? 0 : 1;
        return aTiene - bTiene || String(b.planningCode).localeCompare(String(a.planningCode));
      })
      .map((p) => ({
        value: String(p.id),
        label: `${p.planningCode} · ${p.constSite?.name ?? 'Sin obra'}${p.vehicleIds?.includes(vehiculo) ? ' (vehículo asignado)' : ''}`,
      }));
  }, [planificaciones, trip.vehicleId, trip.planningId]);

  const elegida = planificaciones.find((p) => String(p.id) === planningId);

  // Canteras de la planificación elegida: solo se pide elegir si hay varias.
  const canteras = useMemo(
    () =>
      (elegida?.canteras ?? []).map((c: any) => ({
        value: String(c.canteraId ?? c.cantera?.id),
        label: c.cantera?.nombre ?? `Cantera #${c.canteraId}`,
      })),
    [elegida],
  );

  // La cantera asignada al vehículo en esa planificación, si la tiene.
  useEffect(() => {
    const asignada = (elegida as any)?.vehicleCanteras?.find(
      (vc: any) => String(vc.vehicleId) === String(trip.vehicleId),
    )?.canteraId;
    setCanteraId(asignada != null ? String(asignada) : canteras.length === 1 ? canteras[0].value : '');
  }, [elegida, canteras, trip.vehicleId]);

  const vehiculoFuera = !!elegida && !elegida.vehicleIds?.includes(String(trip.vehicleId));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!planningId) {
      toast.error('Selecciona la planificación correcta.');
      return;
    }
    if (canteras.length > 1 && !canteraId) {
      toast.error('Esta planificación tiene varias canteras: elige de cuál salió el material.');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('El motivo es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { trip: updated, avisoStock } = await transportLogService.changeTripPlanning(trip.id, {
        planningId: Number(planningId),
        canteraId: canteraId ? Number(canteraId) : undefined,
        reason: reason.trim(),
      });
      toast.success('Planificación del viaje corregida');
      if (avisoStock) toast(avisoStock, { icon: '⚠️', duration: 6000 });
      onDone(updated);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'No se pudo cambiar la planificación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
        Viaje <strong>{trip.codigo || `#${trip.id}`}</strong> · {trip.vehicle?.plate} — planificación actual:{' '}
        <strong>{trip.planning?.planningCode ?? 'Sin planificación'}</strong>
        {trip.constSite?.name && <> ({trip.constSite.name})</>}
      </div>

      <SearchableSelect
        label="Planificación correcta *"
        value={planningId}
        onChange={setPlanningId}
        options={opciones}
        placeholder="Buscar planificación u obra..."
        emptyMessage="No hay planificaciones activas con ese nombre"
      />

      {vehiculoFuera && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          El vehículo no está asignado a esta planificación. Se puede corregir igual; queda anotado en el viaje.
        </p>
      )}

      {canteras.length > 1 && (
        <SearchableSelect
          label="Cantera de la que salió el material *"
          value={canteraId}
          onChange={setCanteraId}
          options={canteras}
          placeholder="Elegir cantera..."
        />
      )}

      <p className="text-xs text-gray-500 dark:text-night-muted">
        Se cambian la obra, el cliente y la cantera del viaje, y el material consumido pasa al stock de la nueva cantera.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-night-text mb-1">
          Motivo <span className="text-red-500 dark:text-red-400">*</span>
        </label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 dark:border-night-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: el vehículo seguía asignado a la planificación anterior."
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-night-border">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Cambiar planificación
        </Button>
      </div>
    </form>
  );
};
