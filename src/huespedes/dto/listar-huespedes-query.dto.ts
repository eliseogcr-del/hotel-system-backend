import { IsOptional, IsString } from 'class-validator';

export class ListarHuespedesQueryDto {
  // Busca por nombres, apellidos o número de documento (coincidencia parcial).
  @IsOptional()
  @IsString()
  buscar?: string;
}
