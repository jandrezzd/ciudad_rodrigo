import { IsString, IsNotEmpty, IsOptional, IsNumberString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepartureDto {
  @IsNumberString()
  vehicleId: string;

  @IsOptional()
  @IsNumberString()
  planningId?: string;

  @IsOptional()
  @IsNumberString()
  clientId?: string;

  @IsOptional()
  @IsNumberString()
  constSiteId?: string;

  @IsNumberString()
  departureM3: string;

  @IsString()
  @IsNotEmpty()
  departureLat: string;

  @IsString()
  @IsNotEmpty()
  departureLng: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  materialId?: number;
}