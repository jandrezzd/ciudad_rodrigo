import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportistasController } from './transportistas.controller';
import { TransportistasService } from './transportistas.service';

@Module({
  imports: [PrismaModule],
  controllers: [TransportistasController],
  providers: [TransportistasService],
  exports: [TransportistasService],
})
export class TransportistasModule {}
