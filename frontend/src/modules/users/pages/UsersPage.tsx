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


  const handleCreate = () => {
    setSelectedUser(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
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
      toast.error('Error al guardar usuario');
      throw error;
    }
  };

  const formatRoleLabel = (user: User) => {
    if (user.role === 'SUPERVISOR' && user.roletype) {
      return `${user.role}/${user.roletype}`;
    }
    if (user.role === 'JEFE_DE_OBRA') return 'JEFE DE OBRA';
    return user.role;
  };

  const filteredUsers = sortByNewest(users).filter((user) => {
    if (supervisorFilter === 'ALL') return true;
    return user.role === 'SUPERVISOR' && user.roletype === supervisorFilter;
  });

  const columns = [
    { header: 'Nombres', accessor: 'name' as keyof User },
    { header: 'Cédula', accessor: 'document' as keyof User },
    { header: 'Correo', accessor: 'email' as keyof User },
    {
      header: 'Estado',
      accessor: (row: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {row.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Cargo',
      accessor: (row: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          row.role === 'ADMIN' ? 'bg-blue-100 text-blue-800' : 
          row.role === 'JEFE_DE_OBRA' ? 'bg-emerald-100 text-emerald-800' :
          'bg-purple-100 text-purple-800'
        }`}>
          {formatRoleLabel(row)}
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
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-600 mt-1">Gestión de acceso al sistema</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
        >
          Nuevo Usuario
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 flex items-center justify-between border-l-4 border-blue-500">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-full">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total de Usuarios</p>
            <p className="text-3xl font-bold text-gray-900">{users.length}</p>
          </div>
        </div>
        <div className="text-right text-gray-500 text-sm">
          Usuarios con acceso al sistema
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="w-full sm:w-72">
          <Select
            label="Filtro de supervisores"
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value as 'ALL' | 'OBRA' | 'CANTERA')}
            options={SUPERVISOR_FILTER_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
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
        />
      </Modal>
    </div>
  );
};
