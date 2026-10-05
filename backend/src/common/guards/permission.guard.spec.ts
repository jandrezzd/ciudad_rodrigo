import { PermissionGuard } from './permission.guard';

const contexto = (role = 'SUPERVISOR') =>
  ({
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 3, role } }) }),
  }) as any;

const crearGuard = (requerido: any, permiso: any) => {
  const reflector: any = { getAllAndOverride: jest.fn().mockReturnValue(requerido) };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
    rolePermission: { findFirst: jest.fn().mockResolvedValue(permiso) },
  };
  return new PermissionGuard(reflector, prisma);
};

describe('PermissionGuard', () => {
  it('con una lista de acciones basta tener cualquiera (editar sin crear)', async () => {
    const guard = crearGuard(
      { moduloKey: 'ventas-ordenes', accion: ['create', 'edit'] },
      { canCreate: false, canEdit: true },
    );

    await expect(guard.canActivate(contexto())).resolves.toBe(true);
  });

  it('rechaza si no tiene ninguna de las acciones de la lista', async () => {
    const guard = crearGuard(
      { moduloKey: 'ventas-ordenes', accion: ['create', 'edit'] },
      { canCreate: false, canEdit: false, canView: true },
    );

    await expect(guard.canActivate(contexto())).rejects.toMatchObject({
      status: 403,
    });
  });

  it('una sola acción sigue funcionando igual que antes', async () => {
    const guard = crearGuard(
      { moduloKey: 'clients', accion: 'create' },
      { canCreate: false, canEdit: true },
    );

    await expect(guard.canActivate(contexto())).rejects.toMatchObject({
      status: 403,
    });
  });
});
