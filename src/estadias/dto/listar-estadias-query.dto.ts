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
}
