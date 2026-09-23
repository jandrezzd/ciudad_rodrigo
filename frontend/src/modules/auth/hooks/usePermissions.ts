import { useAuth } from './useAuth';

/**
 * Atajo para leer los 5 permisos de un módulo de una sola vez, en vez de
 * llamar a `hasPermission(moduloKey, accion)` cinco veces por pantalla. Ver
 * `modules/roles` para la lista de `moduloKey` válidos (o `GET /roles/modulos`).
 */
export const usePermissions = (moduloKey: string) => {
  const { hasPermission } = useAuth();

  return {
    canView: hasPermission(moduloKey, 'canView'),
    canCreate: hasPermission(moduloKey, 'canCreate'),
    canEdit: hasPermission(moduloKey, 'canEdit'),
    canDelete: hasPermission(moduloKey, 'canDelete'),
    canToggle: hasPermission(moduloKey, 'canToggle'),
  };
};
