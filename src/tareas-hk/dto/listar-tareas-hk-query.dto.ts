import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListarTareasHkQueryDto {
  @IsOptional()
  @IsEnum(['planificado', 'en_proceso', 'terminado'])
  estado?: string;

  @IsOptional()
  @IsEnum(['limpieza', 'mantenimiento'])
  tipo?: string;

  @IsOptional()
  @IsUUID()
  habitacionId?: string;
}
