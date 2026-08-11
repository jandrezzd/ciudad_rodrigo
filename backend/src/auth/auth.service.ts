import { Injectable, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
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
    });

    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Credenciales incorrectas');

    this.validatePlatformAccess(user.role, origin);

    const payload = { sub: user.id, document: user.document, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        name: user.name,
        roletype: user.roletype,
        role: user.role 
      },
    };
  }

  private validatePlatformAccess(role: string, origin: LoginOrigin) {
    if (origin === LoginOrigin.WEB) {
      if (role === 'SUPERVISOR') {
        throw new ForbiddenException('Usted no tiene acceso a la Plataforma Web');
      }
    }

    if (origin === LoginOrigin.MOBILE) {
      if (role !== 'SUPERVISOR') {
        throw new ForbiddenException('Usted no tiene acceso a la Aplicación Móvil');
      }
    }
  }
}