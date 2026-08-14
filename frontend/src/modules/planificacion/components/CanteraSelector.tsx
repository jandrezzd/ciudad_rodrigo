import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { MapPin } from 'lucide-react';

export interface CanteraOption {
  value: string;
  label: string;
}

interface CanteraSelectorProps {
  /** Canteras de la planificación (no todas las del proveedor) */
  canteras: CanteraOption[];
  value: string | null;
  onChange: (canteraId: string | null) => void;
}

/**
 * Cantera desde la que despacha un vehículo. Es el dato que permite descontar
 * el material del stock correcto cuando se registra la salida.
 *
 * Con una sola cantera no se pide elegir: el backend se la asigna a todos los
 * vehículos automáticamente.
 */
export const CanteraSelector = ({ canteras, value, onChange }: CanteraSelectorProps) => {
  if (canteras.length === 0) {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Seleccione primero las canteras de la planificación para poder asignarle una a este vehículo.
      </div>
    );
  }

  if (canteras.length === 1) {
    return (
      <div>
        <span className="block text-xs font-medium text-gray-500 mb-1">Cantera</span>
        <div className="flex items-center gap-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="truncate">{canteras[0].label}</span>
          <span className="ml-auto text-xs text-gray-400 shrink-0">Única</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">Cantera</span>
        {value ? (
          <span className="text-xs text-green-600">Asignada</span>
        ) : (
          <span className="text-xs text-amber-600">Sin asignar</span>
        )}
      </div>
      <SearchableSelect
        value={value ?? ''}
        onChange={(canteraId) => onChange(canteraId || null)}
        options={canteras}
        placeholder="Seleccionar cantera..."
        emptyMessage="No hay canteras en esta planificación"
      />
    </div>
  );
};
