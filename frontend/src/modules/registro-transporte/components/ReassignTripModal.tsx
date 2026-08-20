import { FormEvent, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '@/shared/components/Button';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useVehicles } from '@/modules/vehicles/hooks/useVehicles';
import { useDrivers } from '@/modules/drivers/hooks/useDrivers';
import { transportLogService } from '../services/transportLogService';
import { TransportLog } from '../types';

interface ReassignTripModalProps {
  trip: TransportLog;
  onDone: (updated: TransportLog) => void;
  onCancel: () => void;
}

/**
 * Reasignar vehículo/chofer de un viaje ya creado — caso vehículo averiado a
 * mitad de viaje, reemplazado por otro. Solo ADMIN (validado también en el
 * backend); el motivo es obligatorio y queda anexado a `observation`.
 */
export const ReassignTripModal = ({ trip, onDone, onCancel }: ReassignTripModalProps) => {
  const { vehicles } = useVehicles();
  const { drivers } = useDrivers();
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const vehicleOptions = useMemo(
    () =>
      vehicles
        .filter((v) => v.isActive !== false)
        .map((v) => ({ value: String(v.id), label: `${v.vehicleid} — ${v.plate}` })),
    [vehicles],
  );

  const driverOptions = useMemo(
    () =>
      drivers
        .filter((d) => d.isActive !== false)
        .map((d) => ({ value: String(d.id), label: `${d.name || 'Sin nombre'} — ${d.document || 'Sin cédula'}` })),
    [drivers],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!vehicleId && !driverId) {
      toast.error('Selecciona un vehículo nuevo, un chofer nuevo, o ambos.');
      return;
    }
    if (!reason.trim()) {
      toast.error('El motivo de la reasignación es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await transportLogService.reassignTrip(trip.id, {
        vehicleId: vehicleId ? Number(vehicleId) : undefined,
        driverId: driverId ? Number(driverId) : undefined,
        reason: reason.trim(),
      });
      toast.success('Viaje reasignado correctamente');
      onDone(updated);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'No se pudo reasignar el viaje');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        Vehículo actual: <strong>{trip.vehicle?.vehicleid} — {trip.vehicle?.plate}</strong>
        {trip.vehicle?.driver?.name && <> · Chofer actual: <strong>{trip.vehicle.driver.name}</strong></>}
      </div>

      <SearchableSelect
        label="Vehículo nuevo (opcional)"
        value={vehicleId}
        onChange={setVehicleId}
        options={vehicleOptions}
        placeholder="Mantener el vehículo actual..."
        emptyMessage="No se encontraron vehículos"
      />

      <SearchableSelect
        label="Chofer nuevo (opcional)"
        value={driverId}
        onChange={setDriverId}
        options={driverOptions}
        placeholder="Mantener el chofer actual..."
        emptyMessage="No se encontraron choferes"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Motivo de la reasignación <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: el vehículo se averió en ruta, lo reemplazó VI-014."
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Reasignar
        </Button>
      </div>
    </form>
  );
};
