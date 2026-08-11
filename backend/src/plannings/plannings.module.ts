import { Module } from '@nestjs/common';
import { PlanningsService } from './plannings.service';
import { PlanningsController } from './plannings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlanningsController],
  providers: [PlanningsService],
  exports: [PlanningsService],
})
export class PlanningsModule {}
