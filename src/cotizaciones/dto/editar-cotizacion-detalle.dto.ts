import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EditarCotizacionDetalleDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  nroPersonas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioPersona?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  // Etiqueta de tipo editada a mano, solo para esta cotización (no toca
  // tipos_habitacion real). String vacío limpia la edición manual y vuelve
  // a la etiqueta automática (Individual/Múltiple/tipo real según personas).
  @IsOptional()
  @IsString()
  tipoManual?: string;
}
