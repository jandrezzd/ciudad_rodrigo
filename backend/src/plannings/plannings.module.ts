import { Module } from '@nestjs/common';
import { PlanningsService } from './plannings.service';
import { PlanningsController } from './plannings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UbicacionLlegadaModule } from '../transport-log/ubicacion-llegada.module';

@Module({
  imports: [PrismaModule, UbicacionLlegadaModule],
  controllers: [PlanningsController],
  providers: [PlanningsService],
  exports: [PlanningsService],
})
export class PlanningsModule {}
