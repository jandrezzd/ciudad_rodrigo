import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useObras } from '../hooks/useObras';
import { obraService } from '../services/obraService';
import { Obra, ObraFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { ObraForm } from './ObraForm';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';
import toast from 'react-hot-toast';

export const ObrasPage = () => {
  const { obras, isLoading, refetch } = useObras();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedObra, setSelectedObra] = useState<Obra | undefined>();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCanton, setSelectedCanton] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleCreate = () => {
    setSelectedObra(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (obra: Obra) => {
    setSelectedObra(obra);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta obra?')) return;
    try {
      setIsDeleting(id);
      await obraService.delete(id);
      toast.success('Obra eliminada exitosamente');
      refetch();
    } catch {
      toast.error('Error al eliminar obra');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSubmit = async (data: ObraFormData) => {
    try {
      if (selectedObra) {
        await obraService.update(selectedObra.id, data);
        toast.success('Obra actualizada exitosamente');
      } else {
        await obraService.create(data);
        toast.success('Obra creada exitosamente');
      }
      setIsModalOpen(false);
      refetch();
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(', ')
        : backendMessage || 'Error al guardar obra';
      toast.error(errorMessage);
      throw error;
    }
  };

  const filteredObras = useMemo(() => {
    return obras.filter(o => {
      const matchesSearch = !searchTerm || 
        o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.client?.companyname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.province.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.canton.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.address.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProvince = !selectedProvince || o.province === selectedProvince;
      const matchesCanton = !selectedCanton || o.canton === selectedCanton;

      return matchesSearch && matchesProvince && matchesCanton;
    });
  }, [obras, searchTerm, selectedProvince, selectedCanton]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedProvince, selectedCanton]);

  const totalObras = filteredObras.length;
  const totalPages = Math.max(1, Math.ceil(totalObras / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedObras = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredObras.slice(start, start + pageSize);
  }, [filteredObras, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const provinceOptions = useMemo(() => 
    Object.keys(ECUADOR_LOCATIONS).map(p => ({ value: p, label: p })),
  []);

  const cantonOptions = useMemo(() => {
    if (!selectedProvince) return [];
    return ECUADOR_LOCATIONS[selectedProvince as keyof typeof ECUADOR_LOCATIONS].map(c => ({ value: c, label: c }));
  }, [selectedProvince]);

  const columns = [
    { header: 'Nombre', accessor: 'name' as keyof Obra },
    {
      header: 'Cliente',
      accessor: (row: Obra) => {
        const name = row.client?.companyname || row.client?.name || '';
        const ruc = row.client?.ruc || '';
        if (!name && !ruc) return 'Sin cliente';
        return `${name}${ruc ? ` (${ruc})` : ''}`;
      },
    },
    { header: 'Provincia', accessor: 'province' as keyof Obra },
    { header: 'Cantón', accessor: 'canton' as keyof Obra },
    { header: 'Dirección', accessor: 'address' as keyof Obra },
    {
      header: 'Abscisas',
      accessor: (row: Obra) => row.abscisa?.toLocaleString() ?? '0',
    },
    {
      header: 'Km distancia Cantera.',
      accessor: (row: Obra) =>
        row.quarryDist?.toLocaleString('es-EC', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) ?? '0,00',
    },
    {
      header: 'Valor (USD)',
      accessor: (row: Obra) =>
        `$${row.value.toLocaleString('es-EC', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
    },
    {
      header: 'Estado',
      accessor: (row: Obra) => (
        <StatusBadge status={row.isActive === false ? 'inactivo' : 'activo'} />
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: Obra) => (
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
          <h1 className="text-3xl font-bold text-gray-900">Obras (Proyectos)</h1>
          <p className="text-gray-600 mt-1">Gestión de sitios de construcción</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
        >
          Nueva Obra
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
              placeholder="Buscar por nombre, dirección..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <SearchableSelect
            options={[{ value: '', label: 'Todas las Provincias' }, ...provinceOptions]}
            value={selectedProvince}
            onChange={(val) => {
              setSelectedProvince(val);
              setSelectedCanton(''); // Reset canton when province changes
            }}
          />

          <SearchableSelect
            options={[{ value: '', label: 'Todos los Cantones' }, ...cantonOptions]}
            value={selectedCanton}
            onChange={setSelectedCanton}
          />
        </div>

        <Table data={paginatedObras} columns={columns} isLoading={isLoading} />
        <Pagination
          className="mt-4"
          total={totalObras}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedObra ? 'Editar Obra' : 'Nueva Obra'}
        size="lg"
      >
        <ObraForm
          obra={selectedObra}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
