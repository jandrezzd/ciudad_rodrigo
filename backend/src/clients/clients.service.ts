import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

    create(data: any) {
        return this.prisma.client.create({ data });
  }

    findAll() {
        return this.prisma.client.findMany();
  }

    update(id: number, data: any) {
        return this.prisma.client.update({
          where: { id },
          data,
    });
  }

    remove(id: number) {
        return this.prisma.client.delete({
          where: { id },
    });
  }
}
