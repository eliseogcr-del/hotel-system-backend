import { Module } from '@nestjs/common';
import { TiposDesayunoController } from './tipos-desayuno.controller';
import { TiposDesayunoService } from './tipos-desayuno.service';

@Module({
  controllers: [TiposDesayunoController],
  providers: [TiposDesayunoService],
})
export class TiposDesayunoModule {}
