import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { RoleType, CompanyStack } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  document: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsInt()
  roleId: number;

  @IsOptional()
  @IsEnum(RoleType)
  roletype: RoleType;

  @IsOptional()
  @IsEnum(CompanyStack)
  company?: CompanyStack;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
