import { Status } from '@/shared/types/common';

interface StatusBadgeProps {
  status: Status | string;
  className?: string;
}

export const StatusBadge = ({ status, className = '' }: StatusBadgeProps) => {
  // Normalización defensiva para admitir tanto minúsculas como mayúsculas de API
  const rawStatus = typeof status === 'string' ? status.toLowerCase().trim() : '';
  const normalizedKey = (
    rawStatus === 'in_progress' ? 'en_progreso' : rawStatus
  ) as Status;

  const variants: Record<Status, string> = {
    activo:
      'bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40',
    inactivo:
      'bg-stone-100 text-stone-700 border-stone-200 dark:bg-night-raised dark:text-night-muted dark:border-night-border',
    suspendido:
      'bg-stone-100 text-stone-700 border-stone-200 dark:bg-night-raised dark:text-night-muted dark:border-night-border',
    completado:
      'bg-blue-50 text-blue-800 border-blue-200/60 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/40',
    pendiente:
      'bg-amber-50 text-amber-800 border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/40',
    en_progreso:
      'bg-amber-50/80 text-amber-800 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700/50',
    cancelado:
      'bg-rose-50 text-rose-800 border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/40',
    alerta:
      'bg-orange-50 text-orange-800 border-orange-200/60 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/40',
    revisado:
      'bg-purple-50 text-purple-800 border-purple-200/60 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/40',
    retrasado:
      'bg-rose-50 text-rose-800 border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/40',
    validado:
      'bg-teal-50 text-teal-800 border-teal-200/60 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/40',
    pendiente_emparejamiento:
      'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200/60 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:border-fuchsia-800/40',
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
    variants[normalizedKey] ||
    'bg-stone-100 text-stone-700 border-stone-200 dark:bg-night-raised dark:text-night-muted dark:border-night-border';

  const currentLabel = labels[normalizedKey] || status;

  return (
    <span
      className={`px-2.5 py-0.5 inline-flex items-center justify-center text-xs leading-5 font-semibold rounded-full whitespace-nowrap shrink-0 border border-transparent transition-colors duration-150 ${currentVariant} ${className}`}
    >
      {currentLabel}
    </span>
  );
};