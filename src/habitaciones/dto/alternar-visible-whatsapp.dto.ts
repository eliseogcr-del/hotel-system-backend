import { IsBoolean } from 'class-validator';

export class AlternarVisibleWhatsappDto {
  @IsBoolean()
  visible: boolean;
}
