import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * A diferencia de ActualizarCocheraDto (catálogo, admin-only: número,
 * tamaño, tipo de vehículo permitido, precio externa), esto es lo que
 * recepción toca día a día desde el panel de Habitaciones -- ocupar/liberar
 * una cochera a mano (ej. el auto de un cliente externo o del personal, sin
 * que esté ligada a ninguna habitación) y dejar una nota libre. Ver
 * ConfiguracionService.actualizarCocheraOperativo().
 */
export class ActualizarCocheraOperativaDto {
  @IsOptional()
  @IsEnum(['disponible', 'ocupada'])
  estado?: 'disponible' | 'ocupada';

  @IsOptional()
  @IsString()
  notas?: string;
}
