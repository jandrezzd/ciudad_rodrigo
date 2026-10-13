import { useState } from 'react';
import { Plus, Pencil, Users } from 'lucide-react';
import { useUsers } from '../hooks/useUsers';
import { userService } from '../services/userService';
import { User, CreateUserData, UpdateUserData } from '../types';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Select';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { UserForm } from '../components/UserForm';
import { sortByNewest } from '@/shared/utils/sort';
import { usePermissions } from '@/modules/auth';
import toast from 'react-hot-toast';

const SUPERVISOR_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Todos los usuarios' },
  { value: 'OBRA', label: 'Supervisores de obra' },
  { value: 'CANTERA', label: 'Supervisores de cantera' },
];

export const UsersPage = () => {
  const { users, isLoading, refetch } = useUsers();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>();
  const [supervisorFilter, setSupervisorFilter] = useState<'ALL' | 'OBRA' | 'CANTERA'>('ALL');
  const { canCreate, canEdit } = usePermissions('users');


  const handleCreate = () => {
    setSelectedUser(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };



  /**
   * El backend valida con class-validator y devuelve en `message` la lista de
   * campos que fallaron. Mostrar "Error al guardar usuario" a secas escondía
   * justamente el dato que explica el 400.
   */
  const describirError = (error: any): string => {
    const detalle = error?.response?.data?.message;
    if (Array.isArray(detalle)) return detalle.join('. ');
    if (typeof detalle === 'string') return detalle;
    return 'No se pudo guardar el usuario. Revise su conexión.';
  };

  const handleSubmit = async (data: any) => {
    try {
      if (selectedUser) {
        await userService.update(selectedUser.id, data as UpdateUserData);
        toast.success('Usuario actualizado exitosamente');
      } else {
        await userService.create(data as CreateUserData);
        toast.success('Usuario creado exitosamente');
      }
      setIsModalOpen(false);
      refetch();
    } catch (error) {
      // Sin `throw`: el formulario no lo atrapaba y la promesa rechazada
      // terminaba como "Uncaught (in promise) AxiosError" en la consola.
      // El modal queda abierto con los datos para poder corregirlos.
      toast.error(describirError(error), { duration: 6000 });
    }
  };

  const formatRoleLabel = (user: User) => {
    const nombreRol = user.roleRef?.name ?? '—';
    if (nombreRol === 'SUPERVISOR' && user.roletype) {
      return `${nombreRol}/${user.roletype}`;
    }
    if (nombreRol === 'JEFE_DE_OBRA') return 'JEFE DE OBRA';
    return nombreRol;
  };

  const filteredUsers = sortByNewest(users).filter((user) => {
    if (supervisorFilter === 'ALL') return true;
    return user.roleRef?.name === 'SUPERVISOR' && user.roletype === supervisorFilter;
  });

  const columns = [
    { header: 'Nombres', accessor: 'name' as keyof User },
    { header: 'Cédula', accessor: 'document' as keyof User },
    { header: 'Correo', accessor: 'email' as keyof User },
    {
      header: 'Estado',
      accessor: (row: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.isActive ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300'}`}>
          {row.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Cargo',
      accessor: (row: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          row.roleRef?.name === 'ADMIN' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' :
          row.roleRef?.name === 'JEFE_DE_OBRA' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' :
          'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300'
        }`}>
          {formatRoleLabel(row)}
        </span>
      ),
    },
    {
      header: 'Telegram',
      accessor: (row: User) => (
        <span
          title={row.telegramChatId ? 'Recibe avisos del bot' : 'Aún no abrió el bot ni compartió su número'}
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            row.telegramChatId ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300' : 'bg-gray-100 dark:bg-night-raised text-gray-500 dark:text-night-muted'
          }`}
        >
          {row.telegramChatId ? 'Vinculado' : 'No vinculado'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: User) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Pencil size={16} />}
            onClick={() => handleEdit(row)}
          >
            Editar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-night-text">Usuarios</h1>
          <p className="text-gray-600 dark:text-night-muted mt-1">Gestión de acceso al sistema</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
          disabled={!canCreate}
          title={!canCreate ? 'Tu cargo no tiene permiso para crear usuarios' : undefined}
        >
          Nuevo Usuario
        </Button>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-6 mb-6 flex items-center justify-between border-l-4 border-blue-500">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-500/15 rounded-full">
            <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-night-muted uppercase tracking-wider">Total de Usuarios</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-night-text">{users.length}</p>
          </div>
        </div>
        <div className="text-right text-gray-500 dark:text-night-muted text-sm">
          Usuarios con acceso al sistema
        </div>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4">
        <div className="w-full sm:w-72">
          <Select
            label="Filtro de supervisores"
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value as 'ALL' | 'OBRA' | 'CANTERA')}
            options={SUPERVISOR_FILTER_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow">
        <Table data={filteredUsers} columns={columns} isLoading={isLoading} />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedUser ? 'Editar Usuario' : 'Nuevo Usuario'}
        size="md"
      >
        <UserForm
          user={selectedUser}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
          canSave={selectedUser ? canEdit : canCreate}
        />
      </Modal>
    </div>
  );
};
