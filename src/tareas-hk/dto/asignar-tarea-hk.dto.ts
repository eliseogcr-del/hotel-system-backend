import { IsUUID } from 'class-validator';

export class AsignarTareaHkDto {
  @IsUUID()
  asignadoA: string;
}
