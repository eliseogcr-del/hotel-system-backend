import { IsUUID } from 'class-validator';

export class CheckinDto {
  @IsUUID()
  reservaHabitacionId: string;
}
