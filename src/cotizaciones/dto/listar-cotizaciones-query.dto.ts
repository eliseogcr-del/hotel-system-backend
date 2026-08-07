import { IsEnum, IsOptional } from 'class-validator';

export class ListarCotizacionesQueryDto {
  @IsOptional()
  @IsEnum(['pendiente', 'aprobada', 'convertida', 'vencida', 'cancelada'])
  estado?: string;
}
