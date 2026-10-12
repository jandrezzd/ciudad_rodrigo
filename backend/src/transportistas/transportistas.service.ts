import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Espacios repetidos fuera, para que "Trans  Pérez " y "Trans Pérez" sean el mismo. */
const limpiarNombre = (name: string) => name.trim().replace(/\s+/g, ' ');

@Injectable()
export class TransportistasService {
  constructor(private prisma: PrismaService) {}

  private buscarPorNombre(name: string) {
    return this.prisma.transportista.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  /** Activos, por nombre: es lo que lista el selector de la orden. */
  findAll() {
    return this.prisma.transportista.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * No se duplican: si ya hay uno con el mismo nombre (sin distinguir
   * mayúsculas) se devuelve ese con `yaExistia: true`, igual que las obras.
   */
  async create(rawName: string) {
    const name = limpiarNombre(rawName);
    const existente = await this.buscarPorNombre(name);
    if (existente) {
      // Si estaba dado de baja, elegirlo de nuevo lo reactiva.
      const transportista = existente.isActive
        ? existente
        : await this.prisma.transportista.update({
            where: { id: existente.id },
            data: { isActive: true },
          });
      return { ...transportista, yaExistia: true };
    }

    const transportista = await this.prisma.transportista.create({
      data: { name },
    });
    return { ...transportista, yaExistia: false };
  }

  /** Corrige el nombre (por ejemplo un error de tipeo al crearlo). */
  async update(id: number, rawName: string) {
    const name = limpiarNombre(rawName);
    const actual = await this.prisma.transportista.findUnique({
      where: { id },
    });
    if (!actual) throw new NotFoundException('EL TRANSPORTISTA NO EXISTE');

    const otro = await this.buscarPorNombre(name);
    if (otro && otro.id !== id) {
      throw new ConflictException(`YA EXISTE EL TRANSPORTISTA "${otro.name}"`);
    }

    return this.prisma.transportista.update({ where: { id }, data: { name } });
  }
}
