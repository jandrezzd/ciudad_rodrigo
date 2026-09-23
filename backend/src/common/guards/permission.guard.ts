import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY, PermissionAction, RequiredPermission } from '../decorators/require-permission.decorator';

const FLAG_BY_ACTION: Record<PermissionAction, string> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  toggle: 'canToggle',
};

/**
 * Corre DESPUÉS de `AuthGuard('jwt')` (van juntos en el mismo `@UseGuards`,
 * en ese orden): ese ya dejó `req.user = { id, document, role }` con el
 * *nombre* del rol, tal como viaja en el JWT.
 *
 * ADMIN nunca se valida contra la matriz — tiene todo, siempre, hardcodeado
 * acá. Es la única forma de que nadie (ni por accidente, ni editando la
 * matriz desde /roles) pueda dejar al sistema sin nadie que lo administre.
 *
 * Un endpoint sin `@RequirePermission` no tiene ningún chequeo (mismo
 * comportamiento que existía antes de este guard: solo hace falta estar
 * autenticado).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // El método manda; si no tiene su propio @RequirePermission, se usa el
    // de la clase (útil en controllers de solo lectura, como reports, donde
    // los 15+ endpoints comparten exactamente el mismo permiso).
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id?: number; role?: string } | undefined;
    if (!user?.role) {
      throw new ForbiddenException('No autenticado');
    }

    if (user.role === 'ADMIN') return true;

    // Se revalida isActive acá: el JWT no se re-verifica contra la base en
    // cada request (dura 1 día), así que desactivar un usuario hoy no lo
    // saca hasta que expire su token si no se chequea en algún lado.
    if (user.id != null) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { isActive: true },
      });
      if (!dbUser?.isActive) {
        throw new ForbiddenException('Usuario inactivo');
      }
    }

    const permiso = await this.prisma.rolePermission.findFirst({
      where: {
        role: { name: user.role, isActive: true },
        modulo: { key: required.moduloKey },
      },
    });

    const flag = FLAG_BY_ACTION[required.accion];
    if (!permiso || !(permiso as any)[flag]) {
      throw new ForbiddenException(
        `Tu cargo no tiene permiso para "${required.accion}" en este módulo`,
      );
    }

    return true;
  }
}
