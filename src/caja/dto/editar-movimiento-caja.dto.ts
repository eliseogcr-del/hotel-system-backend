import { IsNumber } from 'class-validator';

export class EditarMovimientoCajaDto {
  @IsNumber()
  monto: number;
}
