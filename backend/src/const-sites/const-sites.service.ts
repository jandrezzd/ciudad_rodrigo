import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConstSiteDto } from './DTOs/create-const-site.dto';
import { UpdateConstSiteDto } from './DTOs/update-const-site.dto';

@Injectable()
export class ConstSitesService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateConstSiteDto) {
    return this.prisma.constSite.create({
      data,
      include: {
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.constSite.findMany({
      include: {
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.constSite.findUnique({
      where: { id },
      include: {
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async update(id: number, data: UpdateConstSiteDto) {
    return this.prisma.constSite.update({
      where: { id },
      data,
      include: {
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    return this.prisma.constSite.delete({
      where: { id },
    });
  }

  async addClient(constSiteId: number, clientId: number) {
    return this.prisma.clientConstSite.create({
      data: {
        constSiteId,
        clientId,
      },
      include: {
        client: true,
        constSite: true,
      },
    });
  }

  async removeClient(constSiteId: number, clientId: number) {
    return this.prisma.clientConstSite.deleteMany({
      where: {
        constSiteId,
        clientId,
      },
    });
  }

  async getClientsByConstSite(constSiteId: number) {
    return this.prisma.clientConstSite.findMany({
      where: { constSiteId },
      include: {
        client: true,
      },
    });
  }
}
