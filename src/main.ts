import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = Number(configService.get('PORT', 3000));

  app.setGlobalPrefix('api/v1');

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Co-operative Bank Bill Payment API')
    .setDescription(
      'REST API for account registration, bill payments and customer mini statements.',
    )
    .setVersion('1.0.0')
    .addTag('Accounts', 'Account management operations')
    .addTag('Payments', 'Bill payment operations')
    .build();

  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: false,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
    },
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`Application: http://localhost:${port}`);
  logger.log(`API: http://localhost:${port}/api/v1`);
  logger.log(`Swagger: http://localhost:${port}/docs`);
  logger.log(`Swagger JSON: http://localhost:${port}/docs-json`);
}

bootstrap();