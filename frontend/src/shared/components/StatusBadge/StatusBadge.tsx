import { Status } from '@/shared/types/common';

interface StatusBadgeProps {
  status: Status;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const variants = {
    activo: 'bg-green-100 text-green-800',
    inactivo: 'bg-gray-100 text-gray-800',
    suspendido: 'bg-slate-100 text-slate-800',
    completado: 'bg-blue-100 text-blue-800',
    pendiente: 'bg-amber-100 text-amber-800',
    en_progreso: 'bg-yellow-100 text-yellow-800',
    cancelado: 'bg-red-100 text-red-800',
    alerta: 'bg-orange-100 text-orange-800',
    revisado: 'bg-purple-100 text-purple-800',
    retrasado: 'bg-rose-100 text-rose-800',
    validado: 'bg-teal-100 text-teal-800',
  };

  const labels = {
    activo: 'Activo',
    inactivo: 'Inactivo',
    suspendido: 'Suspendido',
    completado: 'Completado',
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    cancelado: 'Cancelado',
    alerta: 'Alerta',
    revisado: 'Revisado',
    retrasado: 'Retrasado',
    validado: 'Validado',
  };

  return (
    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${variants[status]}`}>
      {labels[status]}
    </span>
  );
};
