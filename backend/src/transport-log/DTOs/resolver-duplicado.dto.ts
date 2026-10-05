import { IsBoolean } from 'class-validator';

export class ResolverDuplicadoDto {
  // true: se anula como duplicado. false: es una vuelta real.
  @IsBoolean()
  esDuplicado!: boolean;
}
