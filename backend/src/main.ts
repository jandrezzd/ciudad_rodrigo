import { config as cargarEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BusinessExceptionFilter } from './common/business-exception.filter';
import * as path from 'path';

// Antes de crear la app: los servicios leen process.env (ej.
// TELEGRAM_BOT_TOKEN) al instanciarse.
cargarEnv({ quiet: true });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Sin esto, `nest start --watch` mata el proceso en cada recompilación sin
  // llamar onModuleDestroy: el polling de Telegram (getUpdates) queda colgado
  // y el siguiente arranque choca con 409 hasta que Telegram lo libera solo.
  app.enableShutdownHooks();

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const uploadsRoot = path.join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new BusinessExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
