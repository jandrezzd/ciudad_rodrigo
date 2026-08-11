import { IsNumber, IsString, IsNumberString, IsNotEmpty, IsLatitude, IsLongitude, IsOptional, IsInt } from 'class-validator';

export class RegisterArrivalDto {
  @IsNumberString()
  arrivalM3: string;

  @IsOptional()
  @IsNumberString()
  arrivalM3Corrected?: string;

  @IsOptional()
  @IsString()
  abscisa?: string;

  @IsOptional()
  @IsString()
  arrivalDriverPhoto?: string;

  @IsOptional()
  @IsString()
  arrivalVehiclePhoto?: string;

  @IsOptional()
  @IsString()
  arrivalPlatePhoto?: string;

  @IsOptional()
  @IsString()
  arrivalMaterialPhoto1?: string;

  @IsOptional()
  @IsString()
  arrivalMaterialPhoto2?: string;

  @IsNumberString()
  arrivalLat: string;

  @IsNumberString()
  arrivalLng: string;

  @IsOptional()
  @IsNumberString()
  departureM3Corrected?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsInt()
  materialId?: number;
}
