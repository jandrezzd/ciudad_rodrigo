import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, UserX, Search } from 'lucide-react';
import { useDrivers } from '../hooks/useDrivers';
import { driverService } from '../services/driverService';
import { Driver, DriverFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Select } from '@/shared/components/Select';
import { DriverForm } from './DriverForm';
import toast from 'react-hot-toast';

export const DriversPage = () => {
  const { drivers, isLoading, refetch } = useDrivers();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | undefined>();
  const [isDeactivating, setIsDeactivating] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleCreate = () => {
    setSelectedDriver(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (driver: Driver) => {
    setSelectedDriver(driver);
    setIsModalOpen(true);
  };

  const handleDeactivate = async (driver: Driver) => {
    if (!confirm(`¿Desactivar al chofer ${driver.name || 'sin nombre'}?`)) return;

    try {
      setIsDeactivating(driver.id);
      await driverService.deactivate(driver.id);
      toast.success('Chofer desactivado');
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'No se pudo desactivar el chofer');
    } finally {
      setIsDeactivating(null);
    }
  };

  const handleSubmit = async (data: DriverFormData) => {
    try {
      if (selectedDriver) {
        await driverService.update(selectedDriver.id, data);
        toast.success('Chofer actualizado exitosamente');
      } else {
        await driverService.create(data);
        toast.success('Chofer creado exitosamente');
      }
      setIsModalOpen(false);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'Error al guardar el chofer');
    }
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      const needle = searchTerm.toLowerCase();
      const matchesSearch =
        !needle ||
        (d.name || '').toLowerCase().includes(needle) ||
        (d.document || '').toLowerCase().includes(needle) ||
        (d.phone || '').toLowerCase().includes(needle);

      const isActive = d.isActive !== false;
      const matchesStatus =
        !selectedStatus || (selectedStatus === 'activo' ? isActive : !isActive);

      return matchesSearch && matchesStatus;
    });
  }, [drivers, searchTerm, selectedStatus]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedStatus]);

  const totalDrivers = filteredDrivers.length;
  const totalPages = Math.max(1, Math.ceil(totalDrivers / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDrivers.slice(start, start + pageSize);
  }, [filteredDrivers, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const columns = [
    { header: 'Nombre', accessor: (row: Driver) => row.name || 'Sin nombre' },
    { header: 'Cédula / Documento', accessor: (row: Driver) => row.document || '—' },
    { header: 'Teléfono', accessor: (row: Driver) => row.phone || '—' },
    {
      header: 'Estado',
      accessor: (row: Driver) => (
        <StatusBadge status={row.isActive !== false ? 'activo' : 'inactivo'} />
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: Driver) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Pencil size={16} />}
            onClick={() => handleEdit(row)}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<UserX size={16} />}
            onClick={() => handleDeactivate(row)}
            isLoading={isDeactivating === row.id}
            disabled={row.isActive === false}
          >
            Desactivar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Choferes</h1>
          <p className="text-gray-600 mt-1">Gestión de choferes asignables a vehículos</p>
        </div>
        <Button variant="primary" icon={<Plus size={20} />} onClick={handleCreate}>
          Nuevo Chofer
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, cédula, teléfono..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'activo', label: 'Activo' },
              { value: 'inactivo', label: 'Inactivo' },
            ]}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            hideDefaultOption
          />
        </div>

        <Table data={paginatedDrivers} columns={columns} isLoading={isLoading} emptyMessage="No hay choferes registrados" />
        <Pagination
          className="mt-4"
          total={totalDrivers}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedDriver ? 'Editar Chofer' : 'Nuevo Chofer'}
        size="md"
      >
        <DriverForm
          driver={selectedDriver}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
