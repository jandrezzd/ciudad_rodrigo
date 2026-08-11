import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateConstSiteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  province: string;

  @IsString()
  @IsNotEmpty()
  canton: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  @IsNotEmpty()
  value: number;

  @IsNumber()
  @IsNotEmpty()
  quarryDist: number;

  @IsNumber()
  @IsNotEmpty()
  abscisa: number;
}
