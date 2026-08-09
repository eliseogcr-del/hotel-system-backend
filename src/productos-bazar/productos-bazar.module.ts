import { Module } from '@nestjs/common';
import { ProductosBazarController } from './productos-bazar.controller';
import { ProductosBazarService } from './productos-bazar.service';

@Module({
  controllers: [ProductosBazarController],
  providers: [ProductosBazarService],
})
export class ProductosBazarModule {}
