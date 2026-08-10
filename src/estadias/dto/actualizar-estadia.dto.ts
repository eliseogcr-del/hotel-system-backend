import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Editar una estadía en curso: cambiar la tarifa diaria (aplica hacia
 * adelante -- no recalcula cargos ya registrados, para eso está 'ajuste'
 * en el libro de movimientos) y/o agregar días (extiende el checkout
 * previsto y genera el cargo de alquiler correspondiente por los días
 * nuevos). También permite asignar/quitar la cochera del huésped y
 * registrar los datos de su vehículo.
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

  // Cochera a asignar (debe estar 'disponible', o ser la que ya tiene esta
  // estadía). Se ignora si quitarCochera viene en true.
  @IsOptional()
  @IsUUID()
  cocheraId?: string;

  @IsOptional()
  @IsBoolean()
  quitarCochera?: boolean;

  @IsOptional()
  @IsString()
  vehiculoMarca?: string;

  @IsOptional()
  @IsString()
  vehiculoTipo?: string;

  @IsOptional()
  @IsString()
  vehiculoPlaca?: string;
}
