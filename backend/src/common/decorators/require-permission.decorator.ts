import { SetMetadata } from '@nestjs/common';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'toggle';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  moduloKey: string;
  /** Con un arreglo basta con tener cualquiera de las acciones. */
  accion: PermissionAction | PermissionAction[];
}

/**
 * Marca un endpoint con el módulo y la acción que requiere. Lo lee
 * `PermissionGuard` (que corre después de `AuthGuard('jwt')`, en el mismo
 * `@UseGuards`) para decidir si el rol del usuario logueado puede pasar.
 *
 * Un endpoint sin este decorador no tiene ningún chequeo de permiso — sigue
 * bastando con estar autenticado, igual que hoy. Se usa a propósito así en
 * `auth/*` y en los endpoints de solo-lectura sin dueño claro.
 */
export const RequirePermission = (
  moduloKey: string,
  accion: PermissionAction | PermissionAction[],
) =>
  SetMetadata(PERMISSION_KEY, { moduloKey, accion } as RequiredPermission);
