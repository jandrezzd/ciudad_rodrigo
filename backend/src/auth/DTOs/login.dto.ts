import { IsString, MinLength, IsEnum } from 'class-validator';

export enum LoginOrigin {
  WEB = 'WEB',
  MOBILE = 'MOBILE'
}

export class LoginDto {
  @IsString()
  @MinLength(10)
  document: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(LoginOrigin, { message: 'El origen no se reconoce.' })
  origin: LoginOrigin;
}