import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useProveedores } from '../hooks/useProveedores';
import { proveedorService } from '../services/proveedorService';
import { Proveedor, ProveedorFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { ProveedorForm } from './ProveedorForm';
import toast from 'react-hot-toast';

export const ProveedoresPage = () => {
  const { proveedores, isLoading, refetch } = useProveedores();
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | undefined>();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleCreate = () => {
    setSelectedProveedor(undefined);
    setIsFormModalOpen(true);
  };

  const handleEdit = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
    setIsFormModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
    try {
      setIsDeleting(id);
      await proveedorService.delete(id);
      toast.success('Proveedor eliminado exitosamente');
      refetch();
    } catch (error) {
      console.error(error);
      toast.error('Error al eliminar proveedor');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSubmit = async (data: ProveedorFormData) => {
    try {
      if (selectedProveedor) {
        const payload = Object.keys(data).reduce((acc, key) => {
          const typedKey = key as keyof ProveedorFormData;
          if (data[typedKey] !== selectedProveedor[typedKey]) {
            acc[typedKey] = data[typedKey];
          }
          return acc;
        }, {} as Partial<ProveedorFormData>);

        if (Object.keys(payload).length === 0) {
          toast('No hay cambios para guardar');
          setIsFormModalOpen(false);
          return;
        }

        await proveedorService.update(selectedProveedor.id, payload);
        toast.success('Proveedor actualizado exitosamente');
      } else {
        await proveedorService.create(data);
        toast.success('Proveedor creado exitosamente');
      }
      setIsFormModalOpen(false);
      refetch();
    } catch (error: unknown) {
      console.error('Full error:', error);
      const axiosError = error as { response?: { data?: unknown } };
      if (axiosError.response?.data) {
        console.error('Validation errors:', JSON.stringify(axiosError.response.data, null, 2));
      }
      toast.error('Error al guardar proveedor');
      throw error;
    }
  };

  const filteredProveedores = useMemo(() => {
    if (!searchTerm) return proveedores;
    const term = searchTerm.toLowerCase();
    return proveedores.filter(p =>
      p.companyname?.toLowerCase().includes(term) ||
      p.ruc?.toLowerCase().includes(term) ||
      p.name?.toLowerCase().includes(term) ||
      p.province?.toLowerCase().includes(term) ||
      p.canton?.toLowerCase().includes(term)
    );
  }, [proveedores, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const totalProveedores = filteredProveedores.length;
  const totalPages = Math.max(1, Math.ceil(totalProveedores / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedProveedores = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProveedores.slice(start, start + pageSize);
  }, [filteredProveedores, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const columns = [
    { header: 'RUC', accessor: 'ruc' as keyof Proveedor },
    { header: 'Razón Social', accessor: 'companyname' as keyof Proveedor },
    { header: 'Contacto', accessor: 'name' as keyof Proveedor },
    { header: 'Documento', accessor: 'document' as keyof Proveedor },
    { header: 'Provincia', accessor: 'province' as keyof Proveedor },
    { header: 'Cantón', accessor: 'canton' as keyof Proveedor },
    { header: 'Email', accessor: 'email' as keyof Proveedor },
    { header: 'Teléfono', accessor: 'phone' as keyof Proveedor },
    {
      header: 'Acciones',
      accessor: (row: Proveedor) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Pencil size={16} />}
            onClick={() => handleEdit(row)}
            title="Editar"
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={() => handleDelete(row.id)}
            isLoading={isDeleting === row.id}
            title="Eliminar"
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proveedores de Vehículos</h1>
          <p className="text-gray-600 mt-1">Gestión de proveedores registrados</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
        >
          Nuevo Proveedor
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="mb-4 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por RUC, razón social o contacto..."
            className="pl-10 w-full sm:w-1/2 md:w-1/3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Table data={paginatedProveedores} columns={columns} isLoading={isLoading} />
        <Pagination
          className="mt-4"
          total={totalProveedores}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={selectedProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        size="lg"
      >
        <ProveedorForm
          proveedor={selectedProveedor}
          onSubmit={handleSubmit}
          onCancel={() => setIsFormModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
