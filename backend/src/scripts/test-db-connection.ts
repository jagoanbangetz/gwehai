/**
 * Test database connection
 * Usage: npx ts-node src/scripts/test-db-connection.ts
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

async function testConnection() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'gwehai',
    password: process.env.DB_PASSWORD || 'gwehai_dev_password',
    database: process.env.DB_DATABASE || 'gwehai_db',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false,
    logging: true,
  });

  try {
    console.log('🔄 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected successfully!\n');

    // Test query
    const result = await dataSource.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('📊 Database Info:');
    console.log('   Current Time:', result[0].current_time);
    console.log('   PostgreSQL Version:', result[0].pg_version.split('\n')[0]);
    console.log('\n✅ Database connection test passed!');

    // Check if tables exist
    const tables = await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (tables.length > 0) {
      console.log('\n📋 Existing tables:');
      tables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });
    } else {
      console.log('\n⚠️  No tables found. Run migrations to create tables.');
    }

  } catch (error) {
    console.error('❌ Connection failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

testConnection();
