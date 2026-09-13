import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Default de Express es 100kb -- muy poco para el logo del hotel en
  // base64 (ActualizarHotelDto.logoUrl, hasta ~1.4MB de imagen real). El
  // resto de la API no manda payloads grandes, así que este límite más
  // generoso no afecta nada más.
  app.useBodyParser('json', { limit: '3mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors(); // ajustar orígenes permitidos antes de producción

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hotel system backend corriendo en http://localhost:${port}`);
}
bootstrap();
