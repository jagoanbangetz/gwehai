/**
 * Seed points for users (e.g. 999999 points for development).
 * Usage: npm run db:seed
 *        npm run db:seed -- 5000
 *        npm run db:seed -- 9999 galer@gmail.com   (grant to one user by email)
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { User } from '../entities/user.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { PointLedger, PointLedgerType, PointLedgerReason } from '../entities/point-ledger.entity';

const DEFAULT_POINTS = 999999;

async function seedPoints() {
  const amount = Math.floor(Number(process.argv[2]) || DEFAULT_POINTS);
  const emailFilter = (process.argv[3] || '').trim().toLowerCase();
  if (amount <= 0) {
    console.error('Amount must be positive.');
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
  console.log('✅ Connected to database\n');

  const userRepo = dataSource.getRepository(User);
  const balanceRepo = dataSource.getRepository(UserPointBalance);
  const ledgerRepo = dataSource.getRepository(PointLedger);

  let users = await userRepo.find({ order: { createdAt: 'ASC' } });
  if (emailFilter) {
    users = users.filter((u) => (u.email || '').toLowerCase() === emailFilter);
    if (users.length === 0) {
      console.log(`⚠️  No user found with email: ${process.argv[3]}`);
      await dataSource.destroy();
      process.exit(1);
    }
  }
  if (users.length === 0) {
    console.log('⚠️  No users found. Create a user (e.g. sign up) then run db:seed again.');
    await dataSource.destroy();
    process.exit(0);
  }

  console.log(`📊 Granting ${amount} points to ${users.length} user(s)${emailFilter ? ` (${process.argv[3]})` : ''}...\n`);

  for (const user of users) {
    let newBalance = 0;
    await dataSource.transaction(async (manager) => {
      const ledgerEntry = manager.create(PointLedger, {
        userId: user.id,
        deltaPoints: amount,
        type: PointLedgerType.GRANT,
        reason: PointLedgerReason.PROMOTION,
        refTable: 'seed',
        refId: null,
        metadata: { script: 'db:seed' },
      });
      await manager.save(ledgerEntry);

      let balance = await manager.findOne(UserPointBalance, {
        where: { userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (balance) {
        balance.balance = Number(balance.balance || 0) + amount;
        await manager.save(balance);
        newBalance = Number(balance.balance);
      } else {
        balance = manager.create(UserPointBalance, {
          userId: user.id,
          balance: amount,
        });
        await manager.save(balance);
        newBalance = amount;
      }
    });
    console.log(`   ✅ ${user.email} → ${newBalance} points`);
  }

  console.log(`\n✅ Done. ${users.length} user(s) now have ${amount} points each (or added on top of existing).`);
  await dataSource.destroy();
}

seedPoints().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
