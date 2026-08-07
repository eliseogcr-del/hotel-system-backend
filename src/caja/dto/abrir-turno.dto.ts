import { IsUUID } from 'class-validator';

export class AbrirTurnoDto {
  @IsUUID()
  turnoId: string;
}
