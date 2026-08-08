import { IsString } from 'class-validator';

export class ActualizarNotasDto {
  @IsString()
  notas: string;
}
