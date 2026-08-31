import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { clienteService } from '../services/clienteService';
import { Cliente, ClienteFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Select } from '@/shared/components/Select';
import { ClienteForm } from './ClienteForm';
import toast from 'react-hot-toast';

export const ClientesPage = () => {
  const { clientes, isLoading, refetch } = useClientes();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | undefined>();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const normalizeClientType = (typeValue: Cliente['type']) => {
    if (!typeValue) return typeValue;
    const normalized = String(typeValue).toUpperCase();
    if (normalized === 'PUBLIC') return 'PUBLICO';
    if (normalized === 'PRIVATE') return 'PRIVADO';
    return normalized;
  };

  const handleCreate = () => {
    setSelectedCliente(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este cliente?')) return;

    try {
      setIsDeleting(id);
      await clienteService.delete(Number(id));
      toast.success('Cliente eliminado exitosamente');
      refetch();
    } catch {
      toast.error('Error al eliminar cliente');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSubmit = async (data: ClienteFormData) => {
    try {
      if (selectedCliente) {
        await clienteService.update(Number(selectedCliente.id), data);
        toast.success('Cliente actualizado exitosamente');
      } else {
        const { isActive, ...createData } = data;
        await clienteService.create(createData);
        toast.success('Cliente creado exitosamente');
      }
      setIsModalOpen(false);
      refetch();
    } catch {
      toast.error('Error al guardar cliente');
    }
  };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      const matchesSearch = !searchTerm ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.ruc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.companyname.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = !selectedType || normalizeClientType(c.type) === selectedType;
      const matchesStatus = !selectedStatus ||
        (selectedStatus === 'activo' ? c.isActive : !c.isActive);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [clientes, searchTerm, selectedType, selectedStatus]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedStatus]);

  const totalClientes = filteredClientes.length;
  const totalPages = Math.max(1, Math.ceil(totalClientes / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClientes.slice(start, start + pageSize);
  }, [filteredClientes, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const columns = [
    { header: 'Razón Social o Cliente', accessor: 'companyname' as keyof Cliente },
    { header: 'RUC', accessor: 'ruc' as keyof Cliente },
    { header: 'Contacto', accessor: 'name' as keyof Cliente },
    {
      header: 'Tipo',
      accessor: (row: Cliente) => (normalizeClientType(row.type) === 'PUBLICO' ? 'Público' : 'Privado'),
    },
    {
      header: 'Provincia',
      accessor: (row: Cliente) => row.province || '-',
    },
    {
      header: 'Cantón',
      accessor: (row: Cliente) => row.canton || '-',
    },
    {
      header: 'Estado',
      accessor: (row: Cliente) => <StatusBadge status={row.isActive ? 'activo' : 'inactivo'} />,
    },
    {
      header: 'Acciones',
      accessor: (row: Cliente) => (
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
            icon={<Trash2 size={16} />}
            onClick={() => handleDelete(row.id)}
            isLoading={isDeleting === row.id}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600 mt-1">Gestión de clientes</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
        >
          Nuevo Cliente
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
              placeholder="Buscar por nombre, RUC, razón social..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select
            options={[
              { value: '', label: 'Todos los tipos' },
              { value: 'PRIVADO', label: 'Privado' },
              { value: 'PUBLICO', label: 'Público' },
            ]}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            hideDefaultOption
          />

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

        <Table data={paginatedClientes} columns={columns} isLoading={isLoading} />
        <Pagination
          className="mt-4"
          total={totalClientes}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="md"
      >
        <ClienteForm
          cliente={selectedCliente}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
