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

  @IsOptional()
  @IsInt()
  @Min(1)
  nroPersonas?: number;

  // Desayuno de cortesía incluido en la tarifa (no genera ningún cargo).
  @IsOptional()
  @IsBoolean()
  incluyeDesayuno?: boolean;

  // Si se le va a emitir boleta/factura al cliente -- se copia de la
  // reserva al hacer check-in, pero queda editable aparte desde acá.
  @IsOptional()
  @IsBoolean()
  facturable?: boolean;

  // Reasigna esta reserva a otro huésped YA EXISTENTE en el hotel (ej. el
  // recepcionista se equivocó y dejó la habitación bajo el contacto de un
  // grupo en vez de la persona real que se hospeda). A diferencia de editar
  // los datos del huésped actual (PATCH /huespedes/:id, que modifica ESE
  // registro y por tanto afectaría a TODAS las reservas que lo compartan),
  // esto solo cambia a quién apunta esta reserva puntual -- el huésped
  // original queda intacto.
  @IsOptional()
  @IsUUID()
  nuevoHuespedId?: string;
}
