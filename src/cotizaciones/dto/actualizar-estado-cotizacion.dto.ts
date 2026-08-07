import { IsEnum } from 'class-validator';

export class ActualizarEstadoCotizacionDto {
  @IsEnum(['aprobada', 'cancelada', 'vencida'])
  estado: 'aprobada' | 'cancelada' | 'vencida';
}
