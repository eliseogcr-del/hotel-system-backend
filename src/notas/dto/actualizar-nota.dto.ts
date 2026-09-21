import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { DirigidoA, TipoNota } from './crear-nota.dto';

export class ActualizarNotaDto {
  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(TipoNota)
  tipo?: TipoNota;

  @IsOptional()
  @IsEnum(DirigidoA)
  dirigido_a?: DirigidoA;

  @IsOptional()
  @IsString()
  fecha_hora_inicio_repeticion?: string;

  @IsOptional()
  @IsString()
  fecha_hora_fin_repeticion?: string;

  @IsOptional()
  @IsBoolean()
  repite_diario?: boolean;

  // El formulario de edición siempre manda tipo -- si viene 'Repetitiva' y
  // no es modo diario, exige periodicidad igual que al crear (ver CrearNotaDto).
  @ValidateIf((o) => o.tipo === TipoNota.REPETITIVA && !o.repite_diario)
  @IsIn([1, 5, 10, 15, 60], {
    message: 'Selecciona cada cuánto tiempo se debe repetir el mensaje (1, 5, 10, 15 o 60 minutos).',
  })
  periodicidad_minutos?: number;

  @IsOptional()
  @IsString()
  celular_destino?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  adjuntos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  telefonos_adicionales?: string[];
}
