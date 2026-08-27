import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.owner.create({ data });
  }

  findAll() {
    return this.prisma.owner.findMany();
  }

  update(id: number, data: any) {
    return this.prisma.owner.update({
      where: { id },
      data,
    });
  }

  remove(id: number) {
    return this.prisma.owner.delete({
      where: { id },
    });
  }

  findInternal() {
    return [
      {
        value: 'CIUDAD_RODRIGO',
        label: 'CIUDAD RODRIGO'
      },
      {
        value: 'TRANSVELEZ',
        label: 'TRANSVELEZ'
      }
    ];
  }
}