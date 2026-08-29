import { IsDateString, IsEnum, IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export class ListarEstadiasQueryDto {
  @IsOptional()
  @IsEnum(['pendiente', 'en_curso', 'finalizada'])
  estado?: string;

  // Solo estadías con saldo pendiente (adeudan algo). El frontend solo
  // manda este parámetro cuando el filtro está activado.
  @IsOptional()
  @IsIn(['true'])
  conSaldo?: string;

  // 'true' = solo facturables, 'false' = solo no facturables, ausente =
  // todas.
  @IsOptional()
  @IsIn(['true', 'false'])
  facturable?: string;

  @IsOptional()
  @IsString()
  busqueda?: string;

  @IsOptional()
  @IsNumberString()
  habNumero?: string;

  // Filtran fecha_hora_checkin_prevista por día (hora Lima), inclusivo en
  // ambos extremos -- ver fechaLimaAInstante().
  @IsOptional()
  @IsDateString()
  checkinDesde?: string;

  @IsOptional()
  @IsDateString()
  checkinHasta?: string;

  // Solo se usa (y solo tiene efecto en el backend) cuando estado ===
  // 'finalizada' -- el historial de estadías finalizadas crece sin límite,
  // a diferencia de pendiente/en_curso que están acotadas a lo que hay
  // activo hoy. Página 1-indexed, 100 registros por página.
  @IsOptional()
  @IsNumberString()
  pagina?: string;
}
