import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CrearCotizacionDetalleDto {
  @IsUUID()
  habitacionId: string;

  @IsInt()
  @Min(1)
  nroPersonas: number;

  // Si no se envía: tarifa negociada de la empresa (tarifas_especiales) si
  // aplica, o la tarifa 'normal' vigente del tipo de habitación.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioNocheManual?: number;
}
