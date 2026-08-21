import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaterialService {
  constructor(private prisma: PrismaService) {}

    async findAll() {
        const materials = await this.prisma.material.findMany();

        // Ordenar en memoria y no con orderBy: Postgres ordena un enum por su
        // posición de declaración, no alfabéticamente, y los materiales nuevos se
        // agregaron al final del tipo. Con 60+ materiales la lista quedaría en un
        // orden arbitrario para quien la lee.
        return materials.sort((a, b) => a.materialType.localeCompare(b.materialType, 'es'));
    }
}
