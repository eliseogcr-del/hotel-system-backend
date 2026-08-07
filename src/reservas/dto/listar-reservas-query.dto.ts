import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ListarReservasQueryDto {
  @IsOptional()
  @IsEnum(['pendiente_revision', 'confirmada', 'cancelada'])
  estado?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
