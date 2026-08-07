import { IsEnum, IsOptional } from 'class-validator';

export class ListarEstadiasQueryDto {
  @IsOptional()
  @IsEnum(['pendiente', 'en_curso', 'finalizada'])
  estado?: string;
}
