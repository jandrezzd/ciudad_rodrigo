import { Status } from '@/shared/types/common';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export const StatusBadge = ({ status, className = '' }: StatusBadgeProps) => {
  const variants: Record<Status, string> = {
    activo:
      'bg-green-100 dark:bg-emerald-950/60 text-green-800 dark:text-emerald-300 dark:border dark:border-emerald-800/50',
    inactivo:
      'bg-gray-100 dark:bg-night-raised text-gray-800 dark:text-night-muted dark:border dark:border-night-border',
    suspendido:
      'bg-slate-100 dark:bg-night-raised text-slate-800 dark:text-night-muted dark:border dark:border-night-border',
    completado:
      'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 dark:border dark:border-blue-800/50',
    pendiente:
      'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 dark:border dark:border-amber-800/50',
    en_progreso:
      'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 dark:border dark:border-yellow-800/50',
    cancelado:
      'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 dark:border dark:border-red-800/50',
    alerta:
      'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 dark:border dark:border-orange-800/50',
    revisado:
      'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 dark:border dark:border-purple-800/50',
    retrasado:
      'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 dark:border dark:border-rose-800/50',
    validado:
      'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 dark:border dark:border-teal-800/50',
    pendiente_emparejamiento:
      'bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-800 dark:text-fuchsia-300 dark:border dark:border-fuchsia-800/50',
  };

  const labels: Record<Status, string> = {
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
    pendiente_emparejamiento: 'Pendiente de emparejar',
  };

  const currentVariant =
    variants[status] ||
    'bg-gray-100 dark:bg-night-raised text-gray-800 dark:text-night-muted dark:border dark:border-night-border';

  return (
    <span
      className={`px-2.5 py-0.5 inline-flex items-center justify-center text-xs leading-5 font-semibold rounded-full whitespace-nowrap shrink-0 transition-colors ${currentVariant} ${className}`}
    >
      {labels[status] || status}
    </span>
  );
};