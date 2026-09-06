import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CrearCotizacionDetalleDto {
  @IsUUID()
  habitacionId: string;

  @IsInt()
  @Min(1)
  nroPersonas: number;

  // Precio por persona por noche -- se escribe a mano en el cuadro, no sale
  // de un catálogo (tarifas es por habitación por noche, no por persona).
  @IsNumber()
  @Min(0)
  precioPersona: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
