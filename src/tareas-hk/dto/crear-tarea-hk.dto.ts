import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export type TipoTareaHk = 'limpieza' | 'mantenimiento';

export class CrearTareaHkDto {
  @IsUUID()
  habitacionId: string;

  @IsEnum(['limpieza', 'mantenimiento'])
  tipo: TipoTareaHk;

  @IsOptional()
  @IsInt()
  @Min(1)
  prioridad?: number;

  // Mantenimiento planificado mientras el huésped sigue hospedado (se le
  // pregunta si autoriza el ingreso). Ver CLAUDE.md 3.2: en ese caso la
  // habitación sigue 'ocupada' hasta que el HK inicia la tarea.
  @IsOptional()
  @IsBoolean()
  conHuespedDentro?: boolean;

  @IsOptional()
  @IsUUID()
  asignadoA?: string;
}
