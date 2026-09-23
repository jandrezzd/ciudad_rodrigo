import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, ValidateNested } from 'class-validator';

export class ModuloPermissionDto {
  @IsInt()
  moduloId: number;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canCreate: boolean;

  @IsBoolean()
  canEdit: boolean;

  @IsBoolean()
  canDelete: boolean;

  @IsBoolean()
  canToggle: boolean;
}

/** Reemplaza la matriz completa del rol: una fila por Modulo. */
export class UpdatePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuloPermissionDto)
  permisos: ModuloPermissionDto[];
}
