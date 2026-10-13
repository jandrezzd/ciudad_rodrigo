import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { useRoles } from '../hooks/useRoles';
import { roleService } from '../services/roleService';
import { PermissionMatrixRow, Role, RoleFormData } from '../types';
import { RoleForm } from './RoleForm';

/**
 * Administración de cargos y sus permisos por módulo. Reemplaza la lista fija
 * de "Cargo" que antes vivía hardcodeada en el formulario de Usuarios: cada
 * cargo se crea acá, con nombre libre, y aparece de inmediato en ese
 * desplegable.
 */
export const RolesPage = () => {
  const { roles, modulos, isLoading, refetch } = useRoles();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const handleNuevo = () => {
    setEditingRole(undefined);
    setIsFormOpen(true);
  };

  const handleEditar = (role: Role) => {
    setEditingRole(role);
    setIsFormOpen(true);
  };

  const handleGuardar = async (basics: RoleFormData, permisos: PermissionMatrixRow[]) => {
    try {
      setIsSaving(true);
      if (editingRole) {
        await roleService.update(editingRole.id, basics);
        if (editingRole.name !== 'ADMIN') {
          await roleService.updatePermissions(editingRole.id, permisos);
        }
        toast.success('Cargo actualizado');
      } else {
        await roleService.create(basics);
        toast.success('Cargo creado — ábrelo para configurar sus permisos');
      }
      setIsFormOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo guardar el cargo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEliminar = async (role: Role) => {
    if (!window.confirm(`¿Eliminar el cargo "${role.name}"?`)) return;
    try {
      await roleService.remove(role.id);
      toast.success('Cargo eliminado');
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo eliminar el cargo');
    }
  };

  const columns = [
    {
      header: 'Cargo',
      accessor: (row: Role) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-night-text">{row.name}</span>
          {row.isSystem && (
            <span
              title="Cargo del sistema: su nombre no se puede cambiar"
              className="text-gray-400 dark:text-night-subtle"
            >
              <ShieldCheck size={14} />
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Descripción',
      accessor: (row: Role) => row.description || '—',
    },
    {
      header: 'Usuarios',
      accessor: (row: Role) => row._count.users,
    },
    {
      header: 'Estado',
      accessor: (row: Role) => (
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            row.isActive ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-night-raised text-gray-600 dark:text-night-muted'
          }`}
        >
          {row.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: Role) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
             className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Pencil size={15} />}
            onClick={() => handleEditar(row)}
          />
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={15} />}
            onClick={() => handleEliminar(row)}
            disabled={row.isSystem}
            title={row.isSystem ? 'Los cargos del sistema no se pueden eliminar' : undefined}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-night-text">Roles y permisos</h1>
          <p className="text-sm text-gray-500 dark:text-night-muted mt-1">
            Qué puede hacer cada cargo en cada módulo del sistema.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={handleNuevo}>
          Nuevo cargo
        </Button>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow">
        <Table
          data={roles}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay cargos registrados"
        />
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRole ? `Editar cargo — ${editingRole.name}` : 'Nuevo cargo'}
        size="xl"
      >
        <RoleForm
          role={editingRole}
          modulos={modulos}
          onSubmit={handleGuardar}
          onCancel={() => setIsFormOpen(false)}
        />
        {isSaving && <p className="text-xs text-gray-500 dark:text-night-muted mt-2">Guardando...</p>}
      </Modal>
    </div>
  );
};
