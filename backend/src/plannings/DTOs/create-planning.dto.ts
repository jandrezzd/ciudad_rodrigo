import {
  IsString,
  IsDateString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { VehicleCanteraDto, parseVehicleCanteras } from './vehicle-cantera.dto';

export class CreatePlanningDto {

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  numeroFactura?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string' && value) return [Number(value)];
    return [];
  })
  canteraIds?: number[];

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsNumber()
  @Type(() => Number)
  clientId: number;

  @IsNumber()
  @Type(() => Number)
  constSiteId: number;

  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return [Number(value)];
    return value;
  })
  vehicleIds: number[];

  /**
   * Cantera por vehículo. Lo que no venga acá se completa solo cuando la
   * planificación tiene una sola cantera.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleCanteraDto)
  @Transform(({ value }) => parseVehicleCanteras(value))
  vehicleCanteras?: VehicleCanteraDto[];
}

