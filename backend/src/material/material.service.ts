import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaterialService {
  constructor(private prisma: PrismaService) {}

    async findAll() {
        const materials = await this.prisma.material.findMany({
          orderBy: { materialType: 'asc' },
        });
        return materials;
    }
}
