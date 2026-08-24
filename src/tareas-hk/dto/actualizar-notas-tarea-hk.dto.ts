import { IsOptional, IsString } from 'class-validator';

export class ActualizarNotasTareaHkDto {
  @IsOptional()
  @IsString()
  notas?: string;
}
