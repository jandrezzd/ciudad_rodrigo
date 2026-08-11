import { IsOptional, IsString, IsBoolean, Length } from 'class-validator';

export class UpdateOwnerDto {

  @IsOptional()
  @IsString()
  @Length(13, 13)
  ruc: string;

  @IsOptional()
  @IsString()
  companyname: string;

  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  document: string;

  @IsOptional()
  @IsString()
  province: string;

  @IsOptional()
  @IsString()
  canton: string;

  @IsOptional()
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  phone: string;

  @IsOptional()
  @IsBoolean()
  isActive: boolean;
}
