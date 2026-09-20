import { Module } from '@nestjs/common';
import { NotasController } from './notas.controller';
import { NotasService } from './notas.service';

@Module({
  controllers: [NotasController],
  providers: [NotasService],
})
export class NotasModule {}