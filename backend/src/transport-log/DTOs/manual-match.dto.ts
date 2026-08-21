import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ManualMatchDto {
  @Type(() => Number)
  @IsInt()
  tripId!: number;

  @Type(() => Number)
  @IsInt()
  pendingArrivalId!: number;
}
