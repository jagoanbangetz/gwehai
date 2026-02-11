import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../entities/user.entity';
import { PointsModule } from '../points/points.module';
import { RolesGuard } from './guards/roles.guard';
import { APP_GUARD, Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    PointsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'your-super-secret-jwt-key'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    RolesGuard,
  ],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
