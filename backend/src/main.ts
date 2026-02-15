import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Set global prefix for all routes
  app.setGlobalPrefix('api');
  
  // Enable CORS for React frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'], // Vite default port
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
