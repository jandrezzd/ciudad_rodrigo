import { DriverCargo, DriverTipo } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'EL NOMBRE DEL CHOFER ES OBLIGATORIO' })
  name?: string;

  @IsOptional()
  @IsEnum(DriverTipo, { message: 'EL TIPO DEBE SER INTERNO O EXTERNO' })
  tipo?: DriverTipo;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(DriverCargo)
  cargo?: DriverCargo;

  @IsOptional()
  @IsInt()
  ownerId?: number | null;
}
