import {
  IsString,
  IsDateString,
  IsNumber,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { VehicleCanteraDto, parseVehicleCanteras } from './vehicle-cantera.dto';

enum PlanningStatus {
  PENDIENTE = 'PENDIENTE',
  EN_PROGRESO = 'EN_PROGRESO',
  COMPLETADO = 'COMPLETADO',
  CANCELADO = 'CANCELADO',
  RETRASADO = 'RETRASADO',
}

export class UpdatePlanningDto {
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
  @IsNumber()
  @Type(() => Number)
  clientId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  constSiteId?: number;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string' && value) return [Number(value)];
    return [];
  })
  canteraIds?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(PlanningStatus)
  status?: PlanningStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return [Number(value)];
    return value;
  })
  vehicleIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleCanteraDto)
  @Transform(({ value }) => parseVehicleCanteras(value))
  vehicleCanteras?: VehicleCanteraDto[];

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value === '' || value === null ? null : Number(value),
  )
  distanciaAproximadaKm?: number | null;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) =>
    value === '' || value === null ? null : Number(value),
  )
  tiempoPromedioViajeMin?: number | null;

  // Vacío o null = quitar la ubicación
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) =>
    value === '' || value === null ? null : Number(value),
  )
  ubicacionLlegadaLat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) =>
    value === '' || value === null ? null : Number(value),
  )
  ubicacionLlegadaLng?: number | null;

  // No admite null (la columna tiene default): vacío = no cambiarlo
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(5000)
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : Number(value),
  )
  radioLlegadaM?: number;
}
