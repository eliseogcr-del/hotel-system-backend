import { Module } from '@nestjs/common';
import { ImportacionesCanalController } from './importaciones-canal.controller';
import { ImportacionesCanalService } from './importaciones-canal.service';
import { ParserCanalService } from './parser/parser-canal.service';

@Module({
  controllers: [ImportacionesCanalController],
  providers: [ImportacionesCanalService, ParserCanalService],
})
export class ImportacionesCanalModule {}
