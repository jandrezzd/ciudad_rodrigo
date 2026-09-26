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

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsInt()
  roleId?: number;

  @IsOptional()
  @IsEnum(RoleType)
  roletype?: RoleType;

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
