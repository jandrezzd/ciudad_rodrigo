import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class UpdateConstSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsNumber()
  quarryDist?: number;

  @IsOptional()
  @IsNumber()
  abscisa?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
