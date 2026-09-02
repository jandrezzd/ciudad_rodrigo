import { DriverCargo, DriverTipo } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDriverDto {
  // Nombre y tipo son los únicos obligatorios: un chofer se registra con lo
  // mínimo y se completa después.
  @IsString()
  @IsNotEmpty({ message: 'EL NOMBRE DEL CHOFER ES OBLIGATORIO' })
  name: string;

  @IsEnum(DriverTipo, { message: 'EL TIPO DEBE SER INTERNO O EXTERNO' })
  tipo: DriverTipo;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(DriverCargo)
  cargo?: DriverCargo;

  // Obligatorio solo cuando tipo === EXTERNO; lo valida el servicio, que es
  // quien conoce el par (tipo, ownerId) ya resuelto.
  @IsOptional()
  @IsInt()
  ownerId?: number | null;
}
