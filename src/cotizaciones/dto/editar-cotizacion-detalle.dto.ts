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
}
