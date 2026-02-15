/**
 * Set a user's role to ADMIN by email. If user does not exist and password is
 * provided, creates the user as admin.
 * Usage: npm run make-admin -- <email> [password]
 *        npm run make-admin -- galehajha@gmail.com Lupalagi123
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

config({ path: path.join(__dirname, '../../.env') });

import { User, UserRole } from '../entities/user.entity';

async function makeAdmin() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = (process.argv[3] || '').trim();
  if (!email) {
    console.error('Usage: npm run make-admin -- <email> [password]');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'gwehai',
    password: process.env.DB_PASSWORD || 'gwehai_dev_password',
    database: process.env.DB_DATABASE || 'gwehai_db',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);

  let user = await userRepo.findOne({ where: { email } });
  if (!user) {
    if (!password || password.length < 8) {
      console.error(`User not found: ${email}. To create as admin, run: npm run make-admin -- ${email} <password> (min 8 chars)`);
      await dataSource.destroy();
      process.exit(1);
    }
    const password_hash = await bcrypt.hash(password, 10);
    user = userRepo.create({
      email,
      name: email.split('@')[0] || 'Admin',
      password_hash,
      role: UserRole.ADMIN,
      defaultLanguage: 'en',
    });
    await userRepo.save(user);
    console.log(`✅ Created admin user: ${email}`);
    await dataSource.destroy();
    return;
  }

  if (user.role === UserRole.ADMIN) {
    console.log(`User ${email} is already an admin.`);
    await dataSource.destroy();
    return;
  }

  user.role = UserRole.ADMIN;
  await userRepo.save(user);
  console.log(`✅ ${email} is now an admin.`);
  await dataSource.destroy();
}

makeAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
