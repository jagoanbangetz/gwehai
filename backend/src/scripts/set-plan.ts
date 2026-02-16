/**
 * Set a user's plan by email. Valid plans: FREE, PRO, PRO_PLUS, ULTRA.
 * Usage: npm run set-plan -- <email> <plan>
 *        npm run set-plan -- galehrizky13@gmail.com ULTRA
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { User } from '../entities/user.entity';
import type { PlanId } from '../config/plans.config';

const VALID_PLANS: PlanId[] = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'];

async function setPlan() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const planArg = (process.argv[3] || '').trim().toUpperCase();

  if (!email || !planArg) {
    console.error('Usage: npm run set-plan -- <email> <plan>');
    console.error('Plans: FREE, PRO, PRO_PLUS, ULTRA');
    console.error('Example: npm run set-plan -- galehrizky13@gmail.com ULTRA');
    process.exit(1);
  }

  if (!VALID_PLANS.includes(planArg as PlanId)) {
    console.error(`Invalid plan: ${planArg}. Must be one of: ${VALID_PLANS.join(', ')}`);
    process.exit(1);
  }

  const planId = planArg as PlanId;

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

  const user = await userRepo.findOne({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    await dataSource.destroy();
    process.exit(1);
  }

  user.planId = planId;
  await userRepo.save(user);
  console.log(`✅ ${email} is now on plan: ${planId}`);
  await dataSource.destroy();
}

setPlan().catch((err) => {
  console.error(err);
  process.exit(1);
});
