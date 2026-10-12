import { IsString, MinLength } from 'class-validator';

/** Alta o corrección del nombre / razón social de un transportista. */
export class TransportistaDto {
  @IsString()
  @MinLength(2, {
    message: 'INGRESE EL NOMBRE O RAZÓN SOCIAL DEL TRANSPORTISTA',
  })
  name: string;
}
