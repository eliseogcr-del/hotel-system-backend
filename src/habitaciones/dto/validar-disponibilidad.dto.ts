import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ValidarDisponibilidadDto {
  @IsUUID()
  habitacionId: string;

  @IsISO8601()
  checkinPrevisto: string;

  @IsISO8601()
  checkoutPrevisto: string;

  @IsOptional()
  @IsUUID()
  excluirReservaHabitacionId?: string;
}
