import { Module } from '@nestjs/common';
import { UbicacionLlegadaService } from './ubicacion-llegada.service';

@Module({
  providers: [UbicacionLlegadaService],
  exports: [UbicacionLlegadaService],
})
export class UbicacionLlegadaModule {}
