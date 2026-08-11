import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Eye, Truck, MapPin } from 'lucide-react';
import { useProveedoresMateriales } from '../hooks/useProveedoresMateriales';
import { proveedorMaterialService } from '../services/proveedorMaterialService';
import { ProveedorMaterial, ProveedorMaterialFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ProveedorMaterialForm } from './ProveedorMaterialForm';
import toast from 'react-hot-toast';

export const ProveedorMaterialesPage = () => {
  const { proveedores, isLoading, refetch } = useProveedoresMateriales();
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<ProveedorMaterial | undefined>();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    ruc: '',
    razonSocial: '',
    cantera: ''
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleCreate = () => {
    setSelectedProveedor(undefined);
    setIsFormModalOpen(true);
  };

  const handleEdit = (proveedor: ProveedorMaterial) => {
    setSelectedProveedor(proveedor);
    setIsFormModalOpen(true);
  };

  const handleView = (proveedor: ProveedorMaterial) => {
    setSelectedProveedor(proveedor);
    setIsViewModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este proveedor de material?')) return;
    try {
      setIsDeleting(id);
      await proveedorMaterialService.delete(id);
      toast.success('Proveedor de material eliminado exitosamente');
      refetch();
    } catch (error) {
      console.error(error);
      toast.error('Error al eliminar proveedor de material');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSubmit = async (data: ProveedorMaterialFormData) => {
    try {
      if (selectedProveedor) {
        await proveedorMaterialService.update(selectedProveedor.id, data);
        toast.success('Proveedor de material actualizado exitosamente');
      } else {
        await proveedorMaterialService.create(data);
        toast.success('Proveedor de material creado exitosamente');
      }
      setIsFormModalOpen(false);
      refetch();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al guardar proveedor de material');
    }
  };

  const filteredProveedores = useMemo(() => {
    return proveedores.filter(p => {
      const matchRuc = !filters.ruc || p.ruc?.toLowerCase().includes(filters.ruc.toLowerCase());
      const matchRazonSocial = !filters.razonSocial || p.razonsocial?.toLowerCase().includes(filters.razonSocial.toLowerCase());
      const matchCantera = !filters.cantera || p.canteras.some(c => c.nombre.toLowerCase().includes(filters.cantera.toLowerCase()));
      
      return matchRuc && matchRazonSocial && matchCantera;
    });
  }, [proveedores, filters]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const totalStats = useMemo(() => {
    return {
      proveedores: proveedores.length,
      canteras: proveedores.reduce((acc, p) => acc + p.canteras.length, 0),
    };
  }, [proveedores]);

  const canteraOptions = useMemo(() => {
    const allCanteras = proveedores.flatMap(p => p.canteras.map(c => c.nombre));
    const uniqueCanteras = Array.from(new Set(allCanteras)).sort();
    return [
      { value: '', label: 'Todas las canteras' },
      ...uniqueCanteras.map(c => ({ value: c, label: c }))
    ];
  }, [proveedores]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores de Material</h1>
          <p className="text-gray-600 mt-1">Gestión de proveedores de material y canteras</p>
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Proveedores Registrados</p>
            <p className="text-3xl font-bold text-gray-900">{totalStats.proveedores}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <Truck className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Canteras</p>
            <p className="text-3xl font-bold text-gray-900">{totalStats.canteras}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <MapPin className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por RUC..."
              value={filters.ruc}
              onChange={(e) => setFilters(prev => ({ ...prev, ruc: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por Razón Social..."
              value={filters.razonSocial}
              onChange={(e) => setFilters(prev => ({ ...prev, razonSocial: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="relative z-10 w-full mb-0 pb-0">
            <SearchableSelect
              options={canteraOptions}
              value={filters.cantera}
              onChange={(value) => setFilters(prev => ({ ...prev, cantera: value }))}
              placeholder="Buscar por Cantera..."
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table
            data={paginatedProveedores}
            isLoading={isLoading}
            emptyMessage="No se encontraron proveedores de material"
            columns={[
              { header: 'RUC', accessor: 'ruc' },
              { header: 'Razón Social', accessor: 'razonsocial' },
              { header: 'Email', accessor: 'email' },
              {
                header: 'Ubicación',
                accessor: (p) => (
                  <div className="text-sm">
                    <p className="text-gray-900">{p.canton}, {p.provincia}</p>
                    <p className="text-gray-500 truncate max-w-[200px]">{p.direccion}</p>
                  </div>
                ),
              },
              {
                header: 'Canteras',
                accessor: (p) => (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {p.canteras.length} canteras
                  </span>
                ),
              },
              {
                header: 'Acciones',
                className: 'text-right',
                accessor: (p) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleView(p)}
                      title="Ver Detalles"
                    >
                      <Eye className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(p)}
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4 text-gray-600" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(p.id)}
                      disabled={isDeleting === p.id}
                      className="text-red-600 hover:bg-red-50 hover:border-red-200"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
        
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <Pagination
              page={currentPage}
              total={totalProveedores}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={selectedProveedor ? 'Editar Proveedor de Material' : 'Nuevo Proveedor de Material'}
        size="xl"
      >
        <ProveedorMaterialForm
          initialData={selectedProveedor ? {
            ruc: selectedProveedor.ruc,
            razonsocial: selectedProveedor.razonsocial,
            email: selectedProveedor.email,
            provincia: selectedProveedor.provincia,
            canton: selectedProveedor.canton,
            direccion: selectedProveedor.direccion,
            canteras: selectedProveedor.canteras,
          } : undefined}
          onSubmit={handleSubmit}
          onCancel={() => setIsFormModalOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Detalles del Proveedor de Material"
        size="lg"
      >
        {selectedProveedor && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">RUC</p>
                <p className="mt-1 text-sm text-gray-900">{selectedProveedor.ruc}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Razón Social</p>
                <p className="mt-1 text-sm text-gray-900">{selectedProveedor.razonsocial}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="mt-1 text-sm text-gray-900">{selectedProveedor.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Ubicación</p>
                <p className="mt-1 text-sm text-gray-900">{selectedProveedor.canton}, {selectedProveedor.provincia}</p>
                <p className="text-sm text-gray-500">{selectedProveedor.direccion}</p>
              </div>
            </div>
            
            <div className="mt-6 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Canteras Asignadas</h3>
              {selectedProveedor.canteras.length === 0 ? (
                <p className="text-sm text-gray-500">No hay canteras registradas.</p>
              ) : (
                <div className="space-y-4">
                  {selectedProveedor.canteras.map((cantera, index) => (
                    <div key={cantera.id || index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-2">{cantera.nombre}</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Ubicación:</span>{' '}
                          <span className="text-gray-900">{cantera.canton || '—'}, {cantera.provincia || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Dirección:</span>{' '}
                          <span className="text-gray-900">{cantera.direccion || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button onClick={() => setIsViewModalOpen(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};