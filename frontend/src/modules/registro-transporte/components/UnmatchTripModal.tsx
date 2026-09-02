import { FormEvent, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '@/shared/components/Button';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { transportLogService } from '../services/transportLogService';
import { TransportLog } from '../types';

interface UnmatchTripModalProps {
  trip: TransportLog;
  onDone: (updated: TransportLog) => void;
  onCancel: () => void;
}

/**
 * Deshacer un emparejamiento salida↔llegada — caso "el sistema unió la salida
 * con la llegada equivocada". Solo ADMIN (validado también en el backend); el
 * motivo es obligatorio y queda anexado a `observation`.
 *
 * Después de esto la llegada vuelve al panel "Pendientes de emparejar" y desde
 * ahí se empareja con la salida correcta.
 */
export const UnmatchTripModal = ({ trip, onDone, onCancel }: UnmatchTripModalProps) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error('El motivo del desemparejamiento es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await transportLogService.unmatchTrip(trip.id, reason.trim());
      toast.success('Viaje desemparejado. La llegada volvió a la cola de conciliación.');
      onDone(updated);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'No se pudo desemparejar el viaje', { duration: 6000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
        <p>
          Vehículo: <strong>{trip.vehicle?.vehicleid} — {trip.vehicle?.plate}</strong>
        </p>
        <p>
          Salida: <strong>{formatDateTime(trip.departureAt ?? '')}</strong> ·{' '}
          {formatNumber(trip.departureM3 ?? 0)} m³
        </p>
        <p>
          Llegada que se va a liberar:{' '}
          <strong>{trip.arrivalAt ? formatDateTime(trip.arrivalAt) : '—'}</strong> ·{' '}
          {formatNumber(trip.arrivalM3 ?? 0)} m³
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        La llegada vuelve al panel <strong>Pendientes de emparejar</strong> y el viaje queda
        abierto de nuevo. El emparejamiento automático no la va a tomar por su cuenta: espera
        a que la emparejes a mano con la salida correcta.
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Motivo del desemparejamiento <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: esta llegada corresponde a la salida de la tarde, no a la de la mañana."
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" isLoading={isSubmitting}>
          Desemparejar
        </Button>
      </div>
    </form>
  );
};
