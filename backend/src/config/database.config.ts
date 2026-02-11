import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get('DB_PORT', 5432),
  username: configService.get('DB_USERNAME', 'gwehai'),
  password: configService.get('DB_PASSWORD', 'gwehai_dev_password'),
  database: configService.get('DB_DATABASE', 'gwehai_db'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false, // Use migrations instead of synchronize
  logging: configService.get('NODE_ENV') === 'development',
  ssl: false,
});
