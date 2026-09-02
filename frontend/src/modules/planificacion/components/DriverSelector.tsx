import { useState, useEffect } from 'react';
import { Vehicle, normalizeVehicleType } from '@/modules/vehicles/types';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { vehicleService } from '@/modules/vehicles/services/vehicleService';
import { Driver, ownerLabel } from '@/modules/drivers/types';
import axiosInstance from '@/config/axios';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

interface DriverSelectorProps {
  vehicle: Vehicle;
  allVehicles: Vehicle[];
  onDriverChanged?: () => void;
}

export const DriverSelector = ({ vehicle, allVehicles, onDriverChanged }: DriverSelectorProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    vehicle.driverId ? String(vehicle.driverId) : ''
  );

  // Cargar todos los conductores desde el endpoint dedicado
  useEffect(() => {
    axiosInstance.get<Driver[]>('/drivers')
      .then(res => setAllDrivers(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error('Error cargando conductores:', err));
  }, []);

  // Conductores disponibles: sin vehículo asignado + el conductor actual de este vehículo
  const occupiedDriverIds = new Set(
    allVehicles
      .filter(v => v.driverId && v.id !== vehicle.id) // excluir el vehículo actual
      .map(v => v.driverId!)
  );

  // Un vehículo interno lo maneja un chofer de nómina y uno externo un chofer
  // del proveedor: mezclarlos en la lista es la forma más fácil de asignar mal.
  // Si el tipo del vehículo no se puede normalizar no se filtra nada, para no
  // dejar el selector vacío sin explicación.
  const vehicleType = normalizeVehicleType(vehicle.type);

  const availableDrivers = allDrivers.filter(
    d => !occupiedDriverIds.has(d.id) && (!vehicleType || d.tipo === vehicleType)
  );

  const driverOptions = [
    { value: '', label: 'Sin conductor' },
    ...availableDrivers.map(driver => ({
      value: String(driver.id),
      label: `${driver.name || 'Sin nombre'} - ${driver.document || 'Sin cédula'}${
        driver.tipo === 'EXTERNO' ? ` · ${ownerLabel(driver.owner)}` : ''
      }`,
    }))
  ];

  const handleDriverChange = async (newDriverId: string) => {
    if (newDriverId === selectedDriverId) return;

    setIsUpdating(true);
    try {
      // Actualizar el vehículo con el nuevo conductor
      await vehicleService.update(vehicle.id, {
        driverId: newDriverId ? Number(newDriverId) : null,
      } as any);

      setSelectedDriverId(newDriverId);
      toast.success('Conductor actualizado');
      
      // Notificar al componente padre para refrescar datos
      if (onDriverChanged) {
        onDriverChanged();
      }
    } catch (error) {
      console.error('Error al actualizar conductor:', error);
      toast.error('No se pudo actualizar el conductor');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
          <span>Conductor</span>
          {selectedDriverId && <span className="text-green-600">Asignado</span>}
        </div>
        <SearchableSelect
          options={driverOptions}
          value={selectedDriverId}
          onChange={handleDriverChange}
          disabled={isUpdating}
          placeholder="Buscar o mantener conductor..."
          emptyMessage={
            vehicleType
              ? `No hay choferes ${vehicleType === 'INTERNO' ? 'internos' : 'externos'} disponibles`
              : 'No hay choferes disponibles'
          }
        />
      </div>
      {isUpdating && (
        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin mt-5" />
      )}
    </div>
  );
};
