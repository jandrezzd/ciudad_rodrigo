import { IsOptional, IsString, IsBoolean, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyStringToNull } from '../../common/transformers';

export class UpdateOwnerDto {

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @Length(13, 13)
  ruc?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  companyname?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @Length(10, 10)
  document?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  province?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  canton?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  address?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  email?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
