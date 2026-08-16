import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListarEstadiasQueryDto {
  @IsOptional()
  @IsEnum(['pendiente', 'en_curso', 'finalizada'])
  estado?: string;

  @IsOptional()
  @IsString()
  busqueda?: string;
}
