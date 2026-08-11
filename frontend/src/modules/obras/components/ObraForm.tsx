import { FormEvent, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Select';
import { Obra, ObraFormData } from '../types';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import toast from 'react-hot-toast';

interface ObraFormProps {
  obra?: Obra;
  onSubmit: (data: ObraFormData) => Promise<void>;
  onCancel: () => void;
}

export const ObraForm = ({ obra, onSubmit, onCancel }: ObraFormProps) => {
  const { clientes } = useClientes();

  const formatDecimalDisplay = (rawValue: string) => {
    const normalized = rawValue.replace('.', ',');
    if (normalized.trim() === '') {
      return '0,00';
    }

    const [intPartRaw, decPartRaw = ''] = normalized.split(',');
    const intPart = intPartRaw === '' ? '0' : intPartRaw.replace(/^0+(?=\d)/, '');
    const decPart = decPartRaw;

    if (decPart.length === 0) {
      return `${intPart},00`;
    }
    if (decPart.length === 1) {
      return `${intPart},${decPart}0`;
    }
    return `${intPart},${decPart}`;
  };

  const parseDecimalValue = (rawValue: string) => {
    const normalized = rawValue.replace(',', '.');
    const numericValue = Number(normalized);
    return Number.isNaN(numericValue) ? 0 : numericValue;
  };

  const formatIntegerDisplay = (rawValue: string) => {
    if (rawValue.trim() === '') {
      return '0';
    }
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (digitsOnly === '') {
      return '0';
    }
    return digitsOnly.replace(/^0+(?=\d)/, '');
  };

  const parseIntegerValue = (rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, '');
    const numericValue = Number(digitsOnly);
    return Number.isNaN(numericValue) ? 0 : numericValue;
  };

  const [formData, setFormData] = useState<ObraFormData>({
    name: obra?.name || '',
    province: obra?.province || '',
    canton: obra?.canton || '',
    address: obra?.address || '',
    value: obra?.value || 0,
    abscisa: obra?.abscisa || 0,
    quarryDist: obra?.quarryDist || 0,
    clientId: obra?.clientId || '',
    isActive: obra?.isActive ?? true,
  });

  const [valueInput, setValueInput] = useState<string>(() =>
    formatDecimalDisplay(String(obra?.value ?? 0))
  );

  const [distanceInput, setDistanceInput] = useState<string>(() =>
    formatDecimalDisplay(String(obra?.quarryDist ?? 0))
  );

  const [abscissasInput, setAbscissasInput] = useState<string>(() =>
    formatIntegerDisplay(String(obra?.abscisa ?? 0))
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const clientOptions = clientes
    .filter((cliente) => cliente.isActive)
    .map((cliente) => ({
      value: String(cliente.id),
      label: `${cliente.companyname || cliente.name}${cliente.ruc ? ` (${cliente.ruc})` : ''}`,
    }));

  const statusOptions = [
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' },
  ];

  const handleChange = (field: keyof ObraFormData, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleValueInputChange = (rawValue: string) => {
    const normalized = rawValue.replace('.', ',');

    if (normalized === '') {
      setValueInput('');
      handleChange('value', 0);
      return;
    }

    if (!/^\d*(,\d*)?$/.test(normalized)) {
      return;
    }

    setValueInput(normalized);
    handleChange('value', parseDecimalValue(normalized));
  };

  const handleDistanceInputChange = (rawValue: string) => {
    const normalized = rawValue.replace('.', ',');

    if (normalized === '') {
      setDistanceInput('');
      handleChange('quarryDist', 0);
      return;
    }

    if (!/^\d*(,\d*)?$/.test(normalized)) {
      return;
    }

    setDistanceInput(normalized);
    handleChange('quarryDist', parseDecimalValue(normalized));
  };

  const handleAbscissasInputChange = (rawValue: string) => {
    if (rawValue === '') {
      setAbscissasInput('');
      handleChange('abscisa', 0);
      return;
    }

    if (!/^\d*$/.test(rawValue)) {
      return;
    }

    const normalized = rawValue.replace(/^0+(?=\d)/, '');
    setAbscissasInput(normalized);
    handleChange('abscisa', parseIntegerValue(normalized));
  };

  const handleValueInputBlur = () => {
    const formatted = formatDecimalDisplay(valueInput);
    setValueInput(formatted);
    handleChange('value', parseDecimalValue(formatted));
  };

  const handleDistanceInputBlur = () => {
    const formatted = formatDecimalDisplay(distanceInput);
    setDistanceInput(formatted);
    handleChange('quarryDist', parseDecimalValue(formatted));
  };

  const handleAbscissasInputBlur = () => {
    const formatted = formatIntegerDisplay(abscissasInput);
    setAbscissasInput(formatted);
    handleChange('abscisa', parseIntegerValue(formatted));
  };

  const handleValueInputFocus = () => {
    if (valueInput === '0,00') {
      setValueInput('');
    }
  };

  const handleDistanceInputFocus = () => {
    if (distanceInput === '0,00') {
      setDistanceInput('');
    }
  };

  const handleAbscissasInputFocus = () => {
    if (abscissasInput === '0') {
      setAbscissasInput('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      toast.error('Debes seleccionar un cliente para la obra.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        value: Number(formData.value),
        abscisa: Number(formData.abscisa),
        quarryDist: Number(formData.quarryDist),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Input
            label="Nombre de la Obra"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <SearchableSelect
            label="Cliente"
            options={clientOptions}
            value={formData.clientId}
            onChange={(val) => handleChange('clientId', val)}
            placeholder="Buscar cliente por razón social o RUC"
            required
          />
        </div>
        <SearchableSelect
          label="Provincia"
          options={Object.keys(ECUADOR_LOCATIONS).map(p => ({ value: p, label: p }))}
          value={formData.province}
          onChange={(val) => {
            handleChange('province', val);
            handleChange('canton', ''); // Reset canton when province changes
          }}
          required
        />
        <SearchableSelect
          label="Cantón"
          options={formData.province ? ECUADOR_LOCATIONS[formData.province as keyof typeof ECUADOR_LOCATIONS].map(c => ({ value: c, label: c })) : []}
          value={formData.canton}
          onChange={(val) => handleChange('canton', val)}
          required
        />
        <div className="md:col-span-2">
          <Input
            label="Dirección"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            required
          />
        </div>
        <Select
          label="Estado"
          options={statusOptions}
          value={String(formData.isActive)}
          onChange={(e) => handleChange('isActive', e.target.value === 'true')}
          hideDefaultOption
          required
        />
        <Input
          label="Cantidad de Abscisas"
          type="text"
          inputMode="numeric"
          value={abscissasInput}
          onChange={(e) => handleAbscissasInputChange(e.target.value)}
          onBlur={handleAbscissasInputBlur}
          onFocus={handleAbscissasInputFocus}
          placeholder="0"
          required
        />
        <Input
          label="Km distancia Cantera."
          type="text"
          inputMode="decimal"
          value={distanceInput}
          onChange={(e) => handleDistanceInputChange(e.target.value)}
          onBlur={handleDistanceInputBlur}
          onFocus={handleDistanceInputFocus}
          placeholder="0,00"
          required
        />
        <Input
          label="Valor Estimado (USD)"
          type="text"
          inputMode="decimal"
          value={valueInput}
          onChange={(e) => handleValueInputChange(e.target.value)}
          onBlur={handleValueInputBlur}
          onFocus={handleValueInputFocus}
          placeholder="0,00"
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {obra ? 'Actualizar' : 'Crear'} Obra
        </Button>
      </div>
    </form>
  );
};
