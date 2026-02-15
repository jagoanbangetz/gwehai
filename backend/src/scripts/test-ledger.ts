/**
 * Test script to verify point ledger math
 * 
 * Usage: npm run test:ledger
 * 
 * This script tests:
 * 1. User buys $20 pack -> +100 points
 * 2. User chats -> -X points per message
 * 3. Subscription renewal -> +monthly points grant
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables
config({ path: path.join(__dirname, '../../.env') });

import { User } from '../entities/user.entity';
import { CreditPack } from '../entities/credit-pack.entity';
import { CreditOrder, CreditOrderStatus } from '../entities/credit-order.entity';
import { PointLedger, PointLedgerType, PointLedgerReason } from '../entities/point-ledger.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '../entities/subscription.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';

async function testLedgerMath() {
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

  try {
    // Create test user
    const userRepo = dataSource.getRepository(User);
    let testUser = await userRepo.findOne({ where: { email: 'test@ledger.com' } });
    
    if (!testUser) {
      testUser = userRepo.create({
        email: 'test@ledger.com',
        name: 'Test User',
      });
      await userRepo.save(testUser);
      console.log('✅ Created test user:', testUser.id);
    } else {
      console.log('✅ Using existing test user:', testUser.id);
    }

    const balanceRepo = dataSource.getRepository(UserPointBalance);
    const ledgerRepo = dataSource.getRepository(PointLedger);
    const packRepo = dataSource.getRepository(CreditPack);
    const orderRepo = dataSource.getRepository(CreditOrder);
    const subscriptionRepo = dataSource.getRepository(Subscription);
    const modelRepo = dataSource.getRepository(Model);

    // Initialize balance if needed
    let balance = await balanceRepo.findOne({ where: { userId: testUser.id } });
    if (!balance) {
      balance = balanceRepo.create({ userId: testUser.id, balance: 0 });
      await balanceRepo.save(balance);
    }

    console.log('\n📊 Initial Balance:', balance.balance, 'points\n');

    // Test 1: User buys $20 pack -> +100 points
    console.log('🧪 Test 1: User buys $20 pack -> +100 points');
    const pack = await packRepo.findOne({ where: { priceCents: 2000 } });
    if (!pack) {
      throw new Error('Credit pack not found');
    }

    const order = orderRepo.create({
      userId: testUser.id,
      creditPackId: pack.id,
      status: CreditOrderStatus.COMPLETED,
      provider: 'manual' as any,
      idempotencyKey: `test-${Date.now()}`,
      amountCents: pack.priceCents,
      pointsGranted: pack.points,
    });
    await orderRepo.save(order);

    const grantEntry = ledgerRepo.create({
      userId: testUser.id,
      deltaPoints: pack.points,
      type: PointLedgerType.GRANT,
      reason: PointLedgerReason.CREDIT_PURCHASE,
      refTable: 'credit_orders',
      refId: order.id,
    });
    await ledgerRepo.save(grantEntry);

    balance.balance += pack.points;
    await balanceRepo.save(balance);

    console.log(`   ✅ Granted ${pack.points} points`);
    console.log(`   ✅ New Balance: ${balance.balance} points\n`);

    // Test 2: User chats -> -X points per message
    console.log('🧪 Test 2: User chats -> -X points per message');
    const model = await modelRepo.findOne({ where: { isDefault: true } });
    if (!model) {
      throw new Error('Default model not found');
    }

    // Simulate 3 chat messages
    for (let i = 1; i <= 3; i++) {
      const inputTokens = 100;
      const outputTokens = 200;
      const costPoints = Math.max(
        1,
        Math.ceil(
          (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
            (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000,
        ),
      );

      const spendEntry = ledgerRepo.create({
        userId: testUser.id,
        deltaPoints: -costPoints,
        type: PointLedgerType.SPEND,
        reason: PointLedgerReason.CHAT_USAGE,
        refTable: 'usage_events',
        metadata: { modelId: model.id, messageNumber: i },
      });
      await ledgerRepo.save(spendEntry);

      balance.balance -= costPoints;
      await balanceRepo.save(balance);

      console.log(`   ✅ Message ${i}: Spent ${costPoints} points`);
    }

    console.log(`   ✅ New Balance: ${balance.balance} points\n`);

    // Test 3: Subscription renewal -> +monthly points grant
    console.log('🧪 Test 3: Subscription renewal -> +monthly points grant');
    const monthlyPoints = 50;
    let subscription = await subscriptionRepo.findOne({
      where: { userId: testUser.id, status: SubscriptionStatus.ACTIVE },
    });

    if (!subscription) {
      subscription = subscriptionRepo.create({
        userId: testUser.id,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        monthlyPointsGrant: monthlyPoints,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await subscriptionRepo.save(subscription);
    }

    const renewalEntry = ledgerRepo.create({
      userId: testUser.id,
      deltaPoints: monthlyPoints,
      type: PointLedgerType.SUBSCRIPTION_GRANT,
      reason: PointLedgerReason.SUBSCRIPTION_RENEWAL,
      refTable: 'subscriptions',
      refId: subscription.id,
    });
    await ledgerRepo.save(renewalEntry);

    balance.balance += monthlyPoints;
    await balanceRepo.save(balance);

    console.log(`   ✅ Granted ${monthlyPoints} points from subscription`);
    console.log(`   ✅ New Balance: ${balance.balance} points\n`);

    // Verify ledger math
    console.log('🔍 Verifying ledger math...');
    const allEntries = await ledgerRepo.find({
      where: { userId: testUser.id },
      order: { createdAt: 'ASC' },
    });

    const calculatedBalance = allEntries.reduce((sum, entry) => sum + entry.deltaPoints, 0);
    const cachedBalance = balance.balance;

    console.log(`   Calculated from ledger: ${calculatedBalance} points`);
    console.log(`   Cached balance: ${cachedBalance} points`);

    if (calculatedBalance === cachedBalance) {
      console.log('   ✅ Ledger math is correct!\n');
    } else {
      console.log('   ❌ Ledger math mismatch!\n');
      throw new Error('Ledger verification failed');
    }

    // Summary
    console.log('📋 Summary:');
    console.log(`   Total ledger entries: ${allEntries.length}`);
    console.log(`   Grants: ${allEntries.filter(e => e.deltaPoints > 0).length}`);
    console.log(`   Spends: ${allEntries.filter(e => e.deltaPoints < 0).length}`);
    console.log(`   Final balance: ${balance.balance} points`);
    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

// Run tests
testLedgerMath()
  .then(() => {
    console.log('\n🎉 Test script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test script failed:', error);
    process.exit(1);
  });
