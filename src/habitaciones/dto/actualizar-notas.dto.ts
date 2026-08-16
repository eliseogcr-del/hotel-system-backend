import { IsString } from 'class-validator';

export class ActualizarNotasHabitacionDto {
  // String vacío borra la nota.
  @IsString()
  notas: string;
}
