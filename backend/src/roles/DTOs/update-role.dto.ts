import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateRoleDto {
  /// Se ignora en el service si el rol es isSystem — no se puede renombrar
  /// un cargo del que dependen chequeos hardcodeados por nombre en otros
  /// módulos (auth.service.ts, AppRouter.tsx).
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
