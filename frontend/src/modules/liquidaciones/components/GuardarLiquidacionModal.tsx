import { useEffect, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { formatearDinero, hoyEcuador } from '../utils/liquidacion';

interface GuardarLiquidacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra: string;
  cliente: string;
  cantidadViajes: number;
  total: number;
  isSaving: boolean;
  onConfirm: (datos: { fecha: string; observacion: string }) => void;
}

/** Confirmación antes de guardar: resumen, fecha (hoy por defecto) y observación. */
export const GuardarLiquidacionModal = ({
  isOpen,
  onClose,
  obra,
  cliente,
  cantidadViajes,
  total,
  isSaving,
  onConfirm,
}: GuardarLiquidacionModalProps) => {
  const [fecha, setFecha] = useState(hoyEcuador);
  const [observacion, setObservacion] = useState('');

  // Cada vez que se abre empieza limpio.
  useEffect(() => {
    if (isOpen) {
      setFecha(hoyEcuador());
      setObservacion('');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onClose}
      title="Guardar liquidación"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            isLoading={isSaving}
            disabled={isSaving || !fecha}
            onClick={() => onConfirm({ fecha, observacion: observacion.trim() })}
          >
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
          <div>
            <dt className="text-gray-500 dark:text-night-muted">Obra</dt>
            <dd className="font-medium text-gray-900 dark:text-night-text">{obra}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-night-muted">Cliente</dt>
            <dd className="font-medium text-gray-900 dark:text-night-text">{cliente}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-night-muted">Viajes</dt>
            <dd className="font-medium text-gray-900 dark:text-night-text">{cantidadViajes}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-night-muted">Total</dt>
            <dd className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {formatearDinero(total)}
            </dd>
          </div>
        </dl>

        <Input
          label="Fecha de la liquidación"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-night-text">
            Observación (opcional)
          </label>
          <textarea
            value={observacion}
            maxLength={500}
            rows={3}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej. Quincena 1 de noviembre"
            className="border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </Modal>
  );
};
