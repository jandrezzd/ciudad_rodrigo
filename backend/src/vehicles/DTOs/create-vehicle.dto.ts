import { IsString, IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { VehicleType } from '@prisma/client';

enum VehicleCompany {
  CIUDAD_RODRIGO = 'CIUDAD_RODRIGO',
  TRANSVELEZ = 'TRANSVELEZ',
}

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  vehicleid?: string;

  @IsString()
  plate: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsNumber()
  qrcodeId?: number;

  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @IsOptional()
  @IsNumber()
  // Capacidad 0 hacía saltar el aviso de sobrecarga en cada registro de la app.
  @IsPositive({ message: 'LA CAPACIDAD DEBE SER MAYOR A 0' })
  capacity?: number;

  @IsOptional()
  @IsEnum(VehicleCompany)
  company?: VehicleCompany;

  @IsOptional()
  @IsNumber()
  driverId?: number;

  @IsOptional()
  @IsString()
  driverdoc?: string;

  @IsOptional()
  @IsString()
  driverphone?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsNumber()
  ownerId?: number;
}
