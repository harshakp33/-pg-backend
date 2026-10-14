import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Security: Helmet with Swagger-friendly CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. Cookie Parser middleware for HttpOnly cookie authentication
  app.use(cookieParser());

  // 3. Security: CORS with strict origin validation and credentials
  const isProd = process.env.NODE_ENV === 'production';
  const corsOriginEnv = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
  const configuredOrigins = corsOriginEnv
    ? corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const allowedOrigins = isProd
    ? configuredOrigins
    : (configuredOrigins.length > 0 ? configuredOrigins : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001']);

  if (isProd && allowedOrigins.length === 0) {
    console.error('CRITICAL: No production CORS origins configured (ALLOWED_ORIGINS / CORS_ORIGIN). Credentialed requests will be rejected.');
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (!isProd && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed: ' + origin), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-Id',
      'X-Organization-Id',
      'X-CSRF-Token',
    ],
  });

  // 4. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 5. Global API Prefix
  app.setGlobalPrefix('api');

  // 6. Swagger Documentation Setup at /api/docs (Development Only)
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('PG Management Backend API')
      .setDescription(
        'RESTful API for the PG (Paying Guest) Management SaaS platform. Manages tenant onboarding, properties, rooms, beds, billing, payments, maintenance tickets, staff administration, notices, notifications, and visitors & security.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT Bearer token',
          in: 'header',
        },
        'bearer',
      )
      .addTag('Health', 'Health check and database connectivity')
      .addTag('Auth', 'Authentication, token refresh, and authorization')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'PG Management API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
    console.log('Swagger documentation enabled at /api/docs');
  } else {
    console.log('Swagger documentation disabled in production mode');
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`NestJS Backend running on: http://localhost:${port}/api`);
}

bootstrap();
