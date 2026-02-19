/**
 * Generate a JWT bearer token for a user (for API testing).
 * Usage:
 *   npm run generate-bearer-token -- <email>
 *   npm run generate-bearer-token -- galehajha@gmail.com
 *
 * Requires .env with JWT_SECRET (and DB_* if using email lookup).
 * Output: the token (use as Authorization: Bearer <token>).
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');

import { User } from '../entities/user.entity';

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret?.trim()) {
    console.error('JWT_SECRET is not set in .env');
    process.exit(1);
  }

  if (!email) {
    console.error('Usage: npm run generate-bearer-token -- <email>');
    console.error('Example: npm run generate-bearer-token -- you@example.com');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'gwehai',
    password: process.env.DB_PASSWORD || 'gwehai_dev_password',
    database: process.env.DB_DATABASE || 'gwehai_db',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { email } });
  await dataSource.destroy();

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const payload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, secret, { expiresIn });

  console.log('Bearer token (use in Authorization header or GWEHAI_TEST_JWT):');
  console.log(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
