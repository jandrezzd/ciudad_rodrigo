import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DriverCargo, DriverTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface DriverInput {
  name?: string;
  document?: string;
  phone?: string;
  cargo?: DriverCargo;
  tipo?: DriverTipo;
  ownerId?: number | null;
}

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  // El proveedor viaja en la respuesta para que Choferes pueda mostrarlo en la
  // tabla sin pedir /owners por su cuenta.
  private readonly withOwner = {
    include: {
      owner: { select: { id: true, companyname: true, name: true, ruc: true } },
    },
  };

  findAll() {
    return this.prisma.driver.findMany(this.withOwner);
  }

  async findOne(id: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      ...this.withOwner,
    });
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

  /// Deja los datos en la forma que el esquema espera y valida la única regla
  /// que la base no puede imponer: un chofer EXTERNO pertenece a un proveedor.
  /// `tipoActual`/`ownerActual` son los del chofer en edición, para que un
  /// PATCH que solo manda `ownerId` se valide contra el tipo que ya tiene.
  private async normalize(
    data: DriverInput,
    actual?: { tipo: DriverTipo; ownerId: number | null },
  ) {
    const tipo = data.tipo ?? actual?.tipo ?? DriverTipo.INTERNO;

    const name = data.name?.trim();
    if (data.name !== undefined && !name) {
      throw new BadRequestException('EL NOMBRE DEL CHOFER ES OBLIGATORIO');
    }

    // '' no es "sin cédula": como document es @unique, un segundo chofer con
    // cadena vacía chocaría con el primero. Se guarda null.
    const document =
      data.document === undefined ? undefined : data.document.trim() || null;
    const phone =
      data.phone === undefined ? undefined : data.phone.trim() || null;

    let ownerId =
      data.ownerId === undefined ? (actual?.ownerId ?? null) : data.ownerId;

    if (tipo === DriverTipo.INTERNO) {
      // Un chofer de nómina no cuelga de ningún proveedor: si viene de pasar
      // de EXTERNO a INTERNO hay que soltar el vínculo, no dejarlo colgado.
      ownerId = null;
    } else {
      if (!ownerId) {
        throw new BadRequestException(
          'UN CHOFER EXTERNO DEBE PERTENECER A UN PROVEEDOR',
        );
      }
      const owner = await this.prisma.owner.findUnique({
        where: { id: ownerId },
        select: { id: true, isActive: true },
      });
      if (!owner) throw new NotFoundException('EL PROVEEDOR NO EXISTE');
      if (!owner.isActive) {
        throw new BadRequestException('EL PROVEEDOR ESTÁ INACTIVO');
      }
    }

    return { name, document, phone, cargo: data.cargo, tipo, ownerId };
  }

  /// La cédula es @unique. Comprobarlo acá permite nombrar al chofer con el que
  /// choca, en vez de dejar salir un P2002 crudo como error 500.
  private async assertDocumentoLibre(
    document: string | null | undefined,
    idActual?: number,
  ) {
    if (!document) return;
    const duenoActual = await this.prisma.driver.findUnique({
      where: { document },
      select: { id: true, name: true },
    });
    if (duenoActual && duenoActual.id !== idActual) {
      throw new BadRequestException(
        `LA CÉDULA ${document} YA ESTÁ REGISTRADA EN EL CHOFER ${duenoActual.name}`,
      );
    }
  }

  async create(userId: number, data: DriverInput) {
    await this.assertAdmin(userId);

    const normalized = await this.normalize(data);
    if (!normalized.name) {
      throw new BadRequestException('EL NOMBRE DEL CHOFER ES OBLIGATORIO');
    }
    await this.assertDocumentoLibre(normalized.document);

    return this.prisma.driver.create({
      data: {
        name: normalized.name,
        document: normalized.document,
        phone: normalized.phone,
        cargo: normalized.cargo,
        tipo: normalized.tipo,
        ownerId: normalized.ownerId,
      },
      ...this.withOwner,
    });
  }

  async update(userId: number, id: number, data: DriverInput) {
    await this.assertAdmin(userId);

    const driver = await this.prisma.driver.findUnique({
      where: { id },
      select: { id: true, tipo: true, ownerId: true },
    });
    if (!driver) throw new NotFoundException('EL CHOFER NO EXISTE');

    const normalized = await this.normalize(data, {
      tipo: driver.tipo,
      ownerId: driver.ownerId,
    });
    await this.assertDocumentoLibre(normalized.document, id);

    return this.prisma.driver.update({
      where: { id },
      data: normalized,
      ...this.withOwner,
    });
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
      ...this.withOwner,
    });
  }
}
