import { IsBoolean } from 'class-validator';

export class AlternarMantenimientoDto {
  @IsBoolean()
  activar: boolean;
}
