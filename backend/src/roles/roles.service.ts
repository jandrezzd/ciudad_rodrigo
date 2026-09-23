import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './DTOs/create-role.dto';
import { UpdateRoleDto } from './DTOs/update-role.dto';
import { UpdatePermissionsDto } from './DTOs/update-permissions.dto';

const ROLE_INCLUDE = {
  permissions: { include: { modulo: true } },
  _count: { select: { users: true } },
};

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findModulos() {
    return this.prisma.modulo.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    if (!role) throw new NotFoundException(`Rol con ID ${id} no existe`);
    return role;
  }

  /** Crea el rol y una fila de permisos (todo en false) por cada módulo, para
   *  que la matriz siempre tenga las 14 filas sin importar cuándo se creó. */
  async create(data: CreateRoleDto) {
    const modulos = await this.prisma.modulo.findMany({ select: { id: true } });
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: {
          create: modulos.map((m) => ({ moduloId: m.id })),
        },
      },
      include: ROLE_INCLUDE,
    });
  }

  async update(id: number, data: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (data.name !== undefined && data.name !== role.name && role.isSystem) {
      throw new ForbiddenException(
        'Este cargo es del sistema: su nombre no se puede cambiar (otras partes de la app lo identifican por nombre).',
      );
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(data.name !== undefined && !role.isSystem ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: ROLE_INCLUDE,
    });
  }

  /** Reemplaza la matriz completa. ADMIN nunca se edita: el guard igual lo
   *  ignora siempre (tiene todo hardcodeado), así que dejar editarlo solo
   *  confundiría ("desmarqué algo y no cambió nada"). */
  async updatePermissions(id: number, data: UpdatePermissionsDto) {
    const role = await this.findOne(id);
    if (role.name === 'ADMIN') {
      throw new ForbiddenException('Los permisos de ADMIN no se pueden editar: siempre tiene acceso total.');
    }

    const modulosValidos = new Set((await this.prisma.modulo.findMany({ select: { id: true } })).map((m) => m.id));
    for (const fila of data.permisos) {
      if (!modulosValidos.has(fila.moduloId)) {
        throw new BadRequestException(`El módulo ${fila.moduloId} no existe`);
      }
    }

    await this.prisma.$transaction(
      data.permisos.map((fila) =>
        this.prisma.rolePermission.upsert({
          where: { roleId_moduloId: { roleId: id, moduloId: fila.moduloId } },
          create: {
            roleId: id,
            moduloId: fila.moduloId,
            canView: fila.canView,
            canCreate: fila.canCreate,
            canEdit: fila.canEdit,
            canDelete: fila.canDelete,
            canToggle: fila.canToggle,
          },
          update: {
            canView: fila.canView,
            canCreate: fila.canCreate,
            canEdit: fila.canEdit,
            canDelete: fila.canDelete,
            canToggle: fila.canToggle,
          },
        }),
      ),
    );

    return this.findOne(id);
  }

  /** Baja lógica. Rechaza si es de sistema o si algún usuario lo tiene
   *  asignado — reasignar primero evita usuarios huérfanos sin cargo. */
  async remove(id: number) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new ForbiddenException('Este cargo es del sistema y no se puede eliminar.');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        `Hay ${role._count.users} usuario(s) con este cargo. Reasígnalos antes de eliminarlo.`,
      );
    }
    return this.prisma.role.update({ where: { id }, data: { isActive: false } });
  }
}
