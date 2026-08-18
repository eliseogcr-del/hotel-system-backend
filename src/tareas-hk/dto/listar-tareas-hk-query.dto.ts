import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

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

  // Filtra por el día (hora Lima) en que se creó la tarea -- planificada,
  // en proceso o terminada, cualquier estado cuenta si es de ese día. El
  // frontend siempre manda esto con el día de hoy por defecto.
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
