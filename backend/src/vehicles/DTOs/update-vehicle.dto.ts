import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { VehicleType } from '@prisma/client';

enum VehicleCompany {
  CIUDAD_RODRIGO = 'CIUDAD_RODRIGO',
  TRANSVELEZ = 'TRANSVELEZ',
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  vehicleid?: string;

  @IsOptional()
  @IsString()
  plate?: string;

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
  @Min(0)
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
