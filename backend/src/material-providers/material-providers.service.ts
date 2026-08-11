import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialProviderDto } from './DTOs/create-material-provider.dto';
import { UpdateMaterialProviderDto } from './DTOs/update-material-provider.dto';

@Injectable()
export class MaterialProvidersService {
  constructor(private prisma: PrismaService) {}

  async create(createMaterialProviderDto: CreateMaterialProviderDto) {
    const { canteras, ...providerData } = createMaterialProviderDto;

    return this.prisma.materialProvider.create({
      data: {
        ...providerData,
        canteras: {
          create: canteras,
        },
      },
      include: {
        canteras: true,
      },
    });
  }

  async findAll() {
    return this.prisma.materialProvider.findMany({
      include: {
        canteras: true,
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.materialProvider.findUnique({
      where: { id },
      include: {
        canteras: true,
      },
    });
  }

  async update(id: number, updateMaterialProviderDto: UpdateMaterialProviderDto) {
    const { canteras, ...providerData } = updateMaterialProviderDto;

    // If canteras are provided, delete existing ones and create new ones
    if (canteras && canteras.length > 0) {
      await this.prisma.cantera.deleteMany({
        where: { materialProviderId: id },
      });

      return this.prisma.materialProvider.update({
        where: { id },
        data: {
          ...providerData,
          canteras: {
            create: canteras,
          },
        },
        include: {
          canteras: true,
        },
      });
    }

    return this.prisma.materialProvider.update({
      where: { id },
      data: providerData,
      include: {
        canteras: true,
      },
    });
  }

  async remove(id: number) {
    return this.prisma.materialProvider.delete({
      where: { id },
    });
  }
}
