/**
 * Run migrations directly using DataSource
 * Usage: npx ts-node src/scripts/run-migration.ts
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'gwehai',
  password: process.env.DB_PASSWORD || 'gwehai_dev_password',
  database: process.env.DB_DATABASE || 'gwehai_db',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});

async function runMigrations() {
  try {
    console.log('🔄 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected!\n');

    console.log('🔄 Running migrations...');
    const migrations = await dataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('✅ No pending migrations. Database is up to date!');
    } else {
      console.log(`✅ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach((migration) => {
        console.log(`   - ${migration.name}`);
      });
    }

    // Check tables
    const tables = await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`\n📊 Total tables created: ${tables.length}`);
    if (tables.length > 0) {
      console.log('Tables:');
      tables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runMigrations();
