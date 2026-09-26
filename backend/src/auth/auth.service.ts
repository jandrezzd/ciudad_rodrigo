import {
  Injectable,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginOrigin } from './DTOs/login.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(document: string, password: string, origin: LoginOrigin) {
    const cleanDocument = document.trim().replace(/\s/g, '');
    const user = await this.prisma.user.findUnique({
      where: { document: cleanDocument },
      include: { roleRef: true },
    });

    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid)
      throw new UnauthorizedException('Credenciales incorrectas');

    const roleName = user.roleRef.name;
    this.validatePlatformAccess(roleName, origin);

    // El JWT sigue llevando el mismo shape de siempre ({sub, document,
    // role}), con el *nombre* del rol como string — nada que ya lea
    // payload.role/req.user.role deja de funcionar por este cambio.
    const payload = { sub: user.id, document: user.document, role: roleName };
    const permissions = await this.getPermissionsForRole(roleName);

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        name: user.name,
        roletype: user.roletype,
        role: roleName,
        permissions,
      },
    };
  }

  // Ventana deslizante: cada verificación exitosa reemite el token con 24h
  // frescas, así que la sesión no expira mientras la app siga usándose o
  // sincronizando en segundo plano al menos una vez al día. También devuelve
  // los permisos frescos: no viajan en el JWT (cambiar uno no tendría efecto
  // hasta que el usuario volviera a iniciar sesión, hasta 1 día después) —
  // se piden de nuevo cada vez que el frontend llama a este endpoint.
  async verify(user: { id: number; document: string; role: string }) {
    const payload = { sub: user.id, document: user.document, role: user.role };
    const permissions = await this.getPermissionsForRole(user.role);
    return { access_token: this.jwtService.sign(payload), permissions };
  }

  /** ADMIN no se consulta contra la matriz: siempre tiene todo, en todos los
   *  módulos — mismo criterio hardcodeado que usa PermissionGuard. */
  async getPermissionsForRole(roleName: string) {
    if (roleName === 'ADMIN') {
      const modulos = await this.prisma.modulo.findMany();
      return modulos.map((m) => ({
        moduloKey: m.key,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canToggle: true,
      }));
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: { permissions: { include: { modulo: true } } },
    });
    if (!role) return [];

    return role.permissions.map((p) => ({
      moduloKey: p.modulo.key,
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canToggle: p.canToggle,
    }));
  }

  private validatePlatformAccess(role: string, origin: LoginOrigin) {
    if (origin === LoginOrigin.WEB) {
      if (role === 'SUPERVISOR') {
        throw new ForbiddenException(
          'Usted no tiene acceso a la Plataforma Web',
        );
      }
    }

    if (origin === LoginOrigin.MOBILE) {
      if (role !== 'SUPERVISOR') {
        throw new ForbiddenException(
          'Usted no tiene acceso a la Aplicación Móvil',
        );
      }
    }
  }
}
