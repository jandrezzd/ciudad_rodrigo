import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.driver.findMany();
  }

  async findOne(id: number) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('EL CHOFER NO EXISTE');
    return driver;
  }

  private async assertAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'SOLO UN ADMINISTRADOR PUEDE GESTIONAR CHOFERES',
      );
    }
  }

  async create(
    userId: number,
    data: { name?: string; document?: string; phone?: string },
  ) {
    await this.assertAdmin(userId);
    return this.prisma.driver.create({ data });
  }

  async update(
    userId: number,
    id: number,
    data: { name?: string; document?: string; phone?: string },
  ) {
    await this.assertAdmin(userId);
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('EL CHOFER NO EXISTE');
    return this.prisma.driver.update({ where: { id }, data });
  }

  // Bloquea (no auto-desasigna) si el chofer sigue siendo el conductor
  // actual de un vehículo activo — mismo criterio que OWNER_INACTIVE en
  // submitDeparture: fuerza a reasignar explícitamente primero.
  async deactivate(userId: number, id: number) {
    await this.assertAdmin(userId);

    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: { vehicle: true },
    });
    if (!driver) throw new NotFoundException('EL CHOFER NO EXISTE');

    if (driver.vehicle && driver.vehicle.isActive) {
      throw new BadRequestException(
        `EL CHOFER SIGUE ASIGNADO AL VEHÍCULO ${driver.vehicle.plate}. Reasígnelo antes de desactivarlo.`,
      );
    }

    return this.prisma.driver.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
