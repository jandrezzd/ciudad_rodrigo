import { IsNumber, IsDateString } from 'class-validator';

export class ReportFilterDto {
  @IsNumber()
  ownerId: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
