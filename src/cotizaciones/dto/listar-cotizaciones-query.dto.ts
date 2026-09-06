import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListarCotizacionesQueryDto {
  @IsOptional()
  @IsEnum(['pendiente', 'aprobada', 'convertida', 'vencida', 'cancelada'])
  estado?: string;

  // Filtran fecha_emision (cuándo se armó la cotización), no fecha_desde
  // (cuándo se hospedaría el cliente).
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  // Busca por nombre/apellido del huésped o razón social de la empresa.
  @IsOptional()
  @IsString()
  busqueda?: string;
}
