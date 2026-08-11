import { useEffect, useState } from 'react';
import { Table } from '@/shared/components/Table';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { vehicleService } from '@/modules/vehicles/services/vehicleService';
import { Vehicle } from '@/modules/vehicles/types';
import toast from 'react-hot-toast';

interface ProveedorVehiclesModalProps {
  proveedorId: string;
}

export const ProveedorVehiclesModal = ({ proveedorId }: ProveedorVehiclesModalProps) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setIsLoading(true);
        const response = await vehicleService.getAll();
        // Filtrar vehículos para el proveedor actual
        const filtered = response.data.filter(v => v.provider === proveedorId);
        setVehicles(filtered);
      } catch (err) {
        console.error(err);
        toast.error('Error al cargar la lista de vehículos del proveedor');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (proveedorId) {
      fetchVehicles();
    }
  }, [proveedorId]);

  const columns = [
    { header: 'Placa', accessor: 'plate' as keyof Vehicle },
    { header: 'Marca', accessor: 'brand' as keyof Vehicle },
    { header: 'Modelo', accessor: 'model' as keyof Vehicle },
    { header: 'ID Carro', accessor: 'carId' as keyof Vehicle },
    {
      header: 'Estado',
      accessor: (row: Vehicle) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="mt-4">
      {vehicles.length === 0 && !isLoading ? (
        <p className="text-gray-500 text-center py-4">No hay vehículos registrados para este proveedor.</p>
      ) : (
        <div className="bg-white rounded-lg border">
          <Table data={vehicles} columns={columns} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
};
