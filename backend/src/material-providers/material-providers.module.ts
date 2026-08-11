import { Module } from '@nestjs/common';
import { MaterialProvidersService } from './material-providers.service';
import { MaterialProvidersController } from './material-providers.controller';

@Module({
  providers: [MaterialProvidersService],
  controllers: [MaterialProvidersController],
})
export class MaterialProvidersModule {}
