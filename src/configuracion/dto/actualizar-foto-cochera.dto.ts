import { IsIn, IsOptional, IsString } from 'class-validator';

// Hasta 2 fotos por cochera (slot 1 o 2), cada una con su propia
// descripción (ej. medidas: ancho/largo/altura) -- mismo patrón que
// ActualizarFotoHabitacionDto, con el campo extra de descripcion. fotoUrl/
// descripcion solo se tocan si vienen en el body (permite editar la
// descripción sin volver a mandar la foto, y viceversa) -- null = quitar.
export class ActualizarFotoCocheraDto {
  @IsIn([1, 2])
  slot: 1 | 2;

  @IsOptional()
  @IsString()
  fotoUrl?: string | null;

  @IsOptional()
  @IsString()
  descripcion?: string | null;
}
