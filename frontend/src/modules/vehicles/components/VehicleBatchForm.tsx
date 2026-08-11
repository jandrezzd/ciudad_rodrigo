import { FormEvent, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';

export interface VehicleBatchData {
  ownedCount: number | '';
  rentedCount: number | '';
}

interface VehicleBatchFormProps {
  onSubmit: (data: VehicleBatchData) => Promise<void>;
  onCancel: () => void;
}

export const VehicleBatchForm = ({ onSubmit, onCancel }: VehicleBatchFormProps) => {
  const [counts, setCounts] = useState<VehicleBatchData>({
    ownedCount: '',
    rentedCount: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCountChange = (field: keyof VehicleBatchData, value: string) => {
    if (value === '') {
      setCounts(prev => ({ ...prev, [field]: '' }));
      return;
    }
    const num = parseInt(value);
    setCounts(prev => ({ ...prev, [field]: isNaN(num) ? '' : Math.max(0, num) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        ownedCount: Number(counts.ownedCount) || 0,
        rentedCount: Number(counts.rentedCount) || 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Vehículos Internos"
          type="number"
          value={counts.ownedCount}
          onChange={(e) => handleCountChange('ownedCount', e.target.value)}
          min={0}
        />
        <Input
          label="Vehículos Externos"
          type="number"
          value={counts.rentedCount}
          onChange={(e) => handleCountChange('rentedCount', e.target.value)}
          min={0}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          disabled={!Number(counts.ownedCount) && !Number(counts.rentedCount)}
        >
          Generar QR
        </Button>
      </div>
    </form>
  );
};
