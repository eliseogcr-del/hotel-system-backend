import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Editar una estadía en curso: cambiar la tarifa diaria (aplica hacia
 * adelante -- no recalcula cargos ya registrados, para eso está 'ajuste'
 * en el libro de movimientos) y/o agregar días (extiende el checkout
 * previsto y genera el cargo de alquiler correspondiente por los días
 * nuevos).
 */
export class ActualizarEstadiaDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  tarifaDiaNueva?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  diasAdicionales?: number;
}
