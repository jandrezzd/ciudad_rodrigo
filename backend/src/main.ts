
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BusinessExceptionFilter } from './common/business-exception.filter';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads',
  });

  app.enableCors({
    origin: true, 
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalFilters(new BusinessExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();