import { FormEvent, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { TransportArrivalData, TransportLog } from '../types';

interface TransportArrivalFormJefeProps {
  transportLog: TransportLog;
  onSubmit: (data: TransportArrivalData) => Promise<void>;
  onCancel: () => void;
}

export const TransportArrivalFormJefe = ({ transportLog, onSubmit, onCancel }: TransportArrivalFormJefeProps) => {
  const [formData, setFormData] = useState({
    arrivalM3: '',
    arrivalLat: '',
    arrivalLng: '',
    abscisa: '',
    driverFile: null as File | null,
    vehicleFile: null as File | null,
    plateFile: null as File | null,
    materialFile: null as File | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof typeof formData, value: string | File | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        arrivalM3: formData.arrivalM3 ? Number(formData.arrivalM3) : undefined,
        arrivalLat: formData.arrivalLat ? Number(formData.arrivalLat) : undefined,
        arrivalLng: formData.arrivalLng ? Number(formData.arrivalLng) : undefined,
        abscisa: formData.abscisa || undefined,
        driverFile: formData.driverFile || undefined,
        vehicleFile: formData.vehicleFile || undefined,
        plateFile: formData.plateFile || undefined,
        materialFile: formData.materialFile || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
        Registrando llegada para el vehículo <strong>{transportLog.vehicle?.plate || transportLog.vehicleId}</strong>.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Volumen de llegada (m3)"
          type="number"
          step="0.01"
          value={formData.arrivalM3}
          onChange={(e) => handleChange('arrivalM3', e.target.value)}
          required
        />
        <Input
          label="Latitud de llegada"
          type="number"
          step="0.000001"
          value={formData.arrivalLat}
          onChange={(e) => handleChange('arrivalLat', e.target.value)}
          required
        />
        <Input
          label="Longitud de llegada"
          type="number"
          step="0.000001"
          value={formData.arrivalLng}
          onChange={(e) => handleChange('arrivalLng', e.target.value)}
          required
        />
        <Input
          label="Abscisa"
          value={formData.abscisa}
          onChange={(e) => handleChange('abscisa', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Foto del conductor"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('driverFile', e.target.files?.[0] || null)}
        />
        <Input
          label="Foto del vehículo"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('vehicleFile', e.target.files?.[0] || null)}
        />
        <Input
          label="Foto de la placa"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('plateFile', e.target.files?.[0] || null)}
        />
        <Input
          label="Foto del material"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('materialFile', e.target.files?.[0] || null)}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Registrar llegada
        </Button>
      </div>
    </form>
  );
};
