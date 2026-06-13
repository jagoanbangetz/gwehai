// Default timezone GMT+8 (Asia/Singapore); set before any date usage
if (!process.env.TZ) process.env.TZ = 'Asia/Singapore';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { QueryFailedExceptionFilter } from './common/filters/query-failed-exception.filter';

async function bootstrap() {
  // Security: reject insecure JWT_SECRET at startup
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'your-super-secret-jwt-key') {
    console.error(
      '🔴 FATAL: JWT_SECRET is not set or uses the insecure default "your-super-secret-jwt-key". ' +
      'Set a strong, unique JWT_SECRET in your .env file. Server will NOT start.',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filter: catch QueryFailedError (invalid UUID, bad SQL, etc.)
  // biar ga crash-restart loop
  app.useGlobalFilters(new QueryFailedExceptionFilter());

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // CORS: localhost for dev; add FRONTEND_URL in production (e.g. https://app.example.com)
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const origins = ['http://localhost:3000', 'http://localhost:5173'];
  if (frontendUrl && !origins.includes(frontendUrl)) origins.push(frontendUrl);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend server running on http://localhost:${port}`);

  const googleCallback = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`;
  if (process.env.GOOGLE_CLIENT_ID) {
    console.log(`📌 Google OAuth: Add this EXACT URL to Google Cloud Console → Credentials → Authorized redirect URIs:\n   ${googleCallback}`);
  }
}
bootstrap();
