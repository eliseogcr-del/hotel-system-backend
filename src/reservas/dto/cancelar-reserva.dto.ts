import { IsOptional, IsString } from 'class-validator';

export class CancelarReservaDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
