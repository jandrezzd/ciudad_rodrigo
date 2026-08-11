import { useState } from 'react';
import { ProveedorMaterialFormData, Cantera } from '../types';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';

interface ProveedorMaterialFormProps {
  initialData?: Partial<ProveedorMaterialFormData & { razonsocial: string }>;
  onSubmit: (data: ProveedorMaterialFormData) => Promise<void>;
  onCancel: () => void;
}

export const ProveedorMaterialForm = ({
  initialData,
  onSubmit,
  onCancel,
}: ProveedorMaterialFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState<ProveedorMaterialFormData>({
    ruc: initialData?.ruc || '',
    razonsocial: initialData?.razonsocial || '',
    email: initialData?.email || '',
    provincia: initialData?.provincia || '',
    canton: initialData?.canton || '',
    direccion: initialData?.direccion || '',
    canteras: (initialData?.canteras || []).map((c) => ({
      nombre: c.nombre,
      provincia: c.provincia || '',
      canton: c.canton || '',
      direccion: c.direccion || '',
    })),
  });

  const [availableCantones, setAvailableCantones] = useState<string[]>(
    initialData?.provincia && initialData.provincia in ECUADOR_LOCATIONS
      ? ECUADOR_LOCATIONS[initialData.provincia as keyof typeof ECUADOR_LOCATIONS]
      : []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'provincia') {
      const cantones = value in ECUADOR_LOCATIONS ? ECUADOR_LOCATIONS[value as keyof typeof ECUADOR_LOCATIONS] : [];
      setAvailableCantones(cantones);
      setFormData((prev) => ({ ...prev, provincia: value, canton: '' }));
    }
  };

  const handleAddCantera = () => {
    setFormData((prev) => {
      const newIndex = prev.canteras.length;
      setExpandedIndex(newIndex);
      return {
        ...prev,
        canteras: [
          ...prev.canteras,
          {
            nombre: '',
            provincia: prev.provincia || '',
            canton: prev.canton || '',
            direccion: '',
          },
        ],
      };
    });
  };

  const handleRemoveCantera = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      canteras: prev.canteras.filter((_, i) => i !== index),
    }));
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const handleCanteraChange = (index: number, field: keyof Omit<Cantera, 'id' | 'materialProviderId'>, value: string) => {
    setFormData((prev) => {
      const updatedCanteras = [...prev.canteras];
      updatedCanteras[index] = { ...updatedCanteras[index], [field]: value };
      return { ...prev, canteras: updatedCanteras };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="RUC"
          name="ruc"
          value={formData.ruc}
          onChange={handleChange}
          required
          maxLength={13}
          placeholder="0999999999001"
        />
        <Input
          label="Razón Social"
          name="razonsocial"
          value={formData.razonsocial}
          onChange={handleChange}
          required
          placeholder="Materiales S.A."
        />
        <Input
          label="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="correo@ejemplo.com"
        />
        <Input
          label="Dirección"
          name="direccion"
          value={formData.direccion || ''}
          onChange={handleChange}
          placeholder="Av. Principal"
        />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Provincia</label>
          <select
            name="provincia"
            value={formData.provincia || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccione una provincia</option>
            {Object.keys(ECUADOR_LOCATIONS).map((provincia) => (
              <option key={provincia} value={provincia}>
                {provincia}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Cantón</label>
          <select
            name="canton"
            value={formData.canton || ''}
            onChange={handleChange}
            disabled={!formData.provincia}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">Seleccione un cantón</option>
            {availableCantones.map((canton) => (
              <option key={canton} value={canton}>
                {canton}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Canteras del Proveedor</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddCantera}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Cantera
          </Button>
        </div>

        {formData.canteras.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500">No se han añadido canteras para este proveedor</p>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.canteras.map((cantera, index) => {
              const isExpanded = expandedIndex === index;
              return (
              <div key={index} className="bg-gray-50 rounded-xl border border-gray-200 relative group overflow-hidden transition-all duration-300">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <h4 className="text-sm font-medium text-gray-900 pr-8">
                    Cantera #{index + 1} {cantera.nombre ? `- ${cantera.nombre}` : ''}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCantera(index);
                      }}
                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                      title="Eliminar cantera"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </div>

                <div
                  className={`transition-all duration-300 ease-in-out ${
                    isExpanded ? 'max-h-[1000px] opacity-100 p-4 pt-0' : 'max-h-0 opacity-0 overflow-hidden'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Nombre *"
                      value={cantera.nombre}
                      onChange={(e) => handleCanteraChange(index, 'nombre', e.target.value)}
                      required
                      placeholder="Ej: Cantera Norte"
                    />
                  <Input
                    label="Dirección"
                    value={cantera.direccion || ''}
                    onChange={(e) => handleCanteraChange(index, 'direccion', e.target.value)}
                    placeholder="Dirección exacta"
                  />

                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Provincia Cantera</label>
                    <select
                      value={cantera.provincia || ''}
                      onChange={(e) => {
                        handleCanteraChange(index, 'provincia', e.target.value);
                        handleCanteraChange(index, 'canton', '');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccione una provincia</option>
                      {Object.keys(ECUADOR_LOCATIONS).map((provincia) => (
                        <option key={provincia} value={provincia}>
                          {provincia}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Cantón Cantera</label>
                    <select
                      value={cantera.canton || ''}
                      onChange={(e) => handleCanteraChange(index, 'canton', e.target.value)}
                      disabled={!cantera.provincia}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="">Seleccione un cantón</option>
                      {(cantera.provincia && cantera.provincia in ECUADOR_LOCATIONS
                        ? ECUADOR_LOCATIONS[cantera.provincia as keyof typeof ECUADOR_LOCATIONS]
                        : []
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar Proveedor'}
        </Button>
      </div>
    </form>
  );
};
