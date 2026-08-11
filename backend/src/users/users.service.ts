import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './DTOs/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

async create(data: CreateUserDto) { 

    const { password, ...rest } = data;
    
    const cleanPassword = password.normalize('NFC').trim();
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
  
    return this.prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
      },
    });
  }

  async update(id: number, data: any) {
    if (data.password && typeof data.password === 'string' && data.password.trim().length > 0) {
      
      const cleanPassword = data.password.normalize('NFC').trim();
      data.password = await bcrypt.hash(cleanPassword, 10);
      
    } else {
      delete data.password;
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAll() {
    return this.prisma.user.findMany();
  }
}