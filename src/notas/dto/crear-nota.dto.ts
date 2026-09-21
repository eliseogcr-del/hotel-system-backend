import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUrl, ArrayContains, IsArray, ValidateIf } from 'class-validator';

export enum TipoNota {
  INFORMATIVA = 'Informativa',
  REPETITIVA = 'Repetitiva',
  MENSAJERIA = 'Mensajeria',
}

export enum DirigidoA {
  RECEPCIONISTA = 'Recepcionista',
  HK = 'HK',
  HUESPED = 'Huesped',
}

export class CrearNotaDto {
  @IsString()
  descripcion: string;

  @IsEnum(TipoNota)
  tipo: TipoNota;

  @IsEnum(DirigidoA)
  dirigido_a: DirigidoA;

  @IsOptional()
  @IsString()
  fecha_hora_inicio_repeticion?: string;

  @IsOptional()
  @IsString()
  fecha_hora_fin_repeticion?: string;

  // Modo "diaria": se dispara una vez por día a la hora (no la fecha) de
  // fecha_hora_inicio_repeticion, todos los días hasta fecha_hora_fin_repeticion
  // (o indefinido si no se manda) -- ver RecordatorioNotas.tsx. Alternativa a
  // periodicidad_minutos, que es para repetirse varias veces DENTRO de un
  // único rango.
  @IsOptional()
  @IsBoolean()
  repite_diario?: boolean;

  // Cada cuántos minutos se vuelve a mostrar el popup de la nota mientras
  // esté dentro de su rango de repetición. No aplica (ni se pide) en modo
  // diario, donde se muestra una sola vez por día.
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