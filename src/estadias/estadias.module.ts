import { Module } from '@nestjs/common';
import { EstadiasController } from './estadias.controller';
import { EstadiasService } from './estadias.service';

@Module({
  controllers: [EstadiasController],
  providers: [EstadiasService],
})
export class EstadiasModule {}
