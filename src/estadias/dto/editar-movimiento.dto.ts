import { IsNumber } from 'class-validator';

export class EditarMovimientoDto {
  @IsNumber()
  monto: number;
}
