import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

export class ListarReservasQueryDto {
  @IsOptional()
  @IsEnum(['pendiente_revision', 'confirmada', 'cancelada'])
  estado?: string;

  // Busca por nombre/apellido del huésped o razón social de la empresa
  // (lo que se muestra en la columna "Huésped" de la grilla) -- ver
  // ReservasService.listar().
  @IsOptional()
  @IsString()
  busqueda?: string;

  // Filtran fecha_hora_checkin_prevista de cada línea (no fecha_ingreso de
  // la reserva), ya que la vista de lista es una fila por habitación.
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsNumberString()
  habNumero?: string;
}
