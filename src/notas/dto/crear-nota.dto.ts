import { IsEnum, IsOptional, IsString, IsUrl, ArrayContains, IsArray } from 'class-validator';

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