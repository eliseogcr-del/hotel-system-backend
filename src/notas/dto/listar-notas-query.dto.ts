import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { TipoNota } from './crear-nota.dto';

export class ListarNotasQueryDto {
  @IsOptional()
  @IsEnum(TipoNota)
  tipo?: TipoNota;

  // 'true' (default si no se manda) trae las notas visibles; 'false' trae
  // las que se ocultaron (notas.visible=false) -- ver NotasService.listar().
  // Viene como string porque es un query param.
  @IsOptional()
  @IsIn(['true', 'false'])
  visible?: string;
}
