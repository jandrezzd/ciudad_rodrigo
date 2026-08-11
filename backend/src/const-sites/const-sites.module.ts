import { Module } from '@nestjs/common';
import { ConstSitesService } from './const-sites.service';
import { ConstSitesController } from './const-sites.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ConstSitesController],
  providers: [ConstSitesService],
  exports: [ConstSitesService],
})
export class ConstSitesModule {}
