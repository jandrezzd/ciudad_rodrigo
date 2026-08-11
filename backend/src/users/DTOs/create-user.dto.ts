import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Role, RoleType, CompanyStack } from '@prisma/client';

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

  @IsEnum(Role)
  role: Role;

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
