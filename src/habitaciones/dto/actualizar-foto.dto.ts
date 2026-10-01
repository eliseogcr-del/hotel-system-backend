import { IsIn, IsOptional, IsString } from 'class-validator';

// Hasta 2 fotos por habitación (ver CLAUDE.md/comentario en habitaciones
// table): slot 1 o 2, guardadas como data URI (igual patrón que
// hoteles.logo_url -- imagen chica, no vale la pena un bucket de storage
// para esto). fotoUrl null/omitido = quitar la foto de ese slot.
export class ActualizarFotoHabitacionDto {
  @IsIn([1, 2])
  slot: 1 | 2;

  @IsOptional()
  @IsString()
  fotoUrl?: string | null;
}
