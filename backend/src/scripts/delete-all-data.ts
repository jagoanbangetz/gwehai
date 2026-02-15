/**
 * TEMP script: delete all reports, conversations, messages, message_parts, and conversation_memory.
 * Use for local/dev cleanup. Does NOT delete users, pentest jobs, or other app data.
 *
 * Usage: npx ts-node src/scripts/delete-all-data.ts
 *        npx ts-node src/scripts/delete-all-data.ts --confirm
 *
 * Without --confirm, prints what would be deleted and exits.
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
  synchronize: false,
  logging: false,
});

async function deleteAllData() {
  const confirm = process.argv.includes('--confirm');
  try {
    await dataSource.initialize();

    const run = (sql: string, params?: any[]) =>
      dataSource.query(sql, params);

    const count = async (table: string): Promise<number> => {
      const r = await run(`SELECT COUNT(*) as c FROM ${table}`);
      return Number(r[0]?.c ?? 0);
    };

    const reportsCount = await count('reports');
    const hacktivityCount = await count('hacktivity');
    const convCount = await count('conversations');
    const msgCount = await count('messages');
    const partsCount = await count('message_parts');
    const memCount = await count('conversation_memory');

    console.log('Current row counts:');
    console.log('  reports:           ', reportsCount);
    console.log('  hacktivity:        ', hacktivityCount);
    console.log('  conversations:     ', convCount);
    console.log('  messages:          ', msgCount);
    console.log('  message_parts:     ', partsCount);
    console.log('  conversation_memory:', memCount);

    if (!confirm) {
      console.log('\nTo delete all of the above, run:');
      console.log('  npx ts-node src/scripts/delete-all-data.ts --confirm');
      return;
    }

    console.log('\nDeleting (order: reports → hacktivity → message_parts → messages → conversation_memory → conversations)...');

    await run('DELETE FROM reports');
    console.log('  deleted reports');
    await run('DELETE FROM hacktivity');
    console.log('  deleted hacktivity');
    await run('DELETE FROM message_parts');
    console.log('  deleted message_parts');
    await run('DELETE FROM messages');
    console.log('  deleted messages');
    await run('DELETE FROM conversation_memory');
    console.log('  deleted conversation_memory');
    await run('DELETE FROM conversations');
    console.log('  deleted conversations');

    console.log('\nDone. All reports, hacktivity, conversations, messages, message_parts, and conversation_memory have been deleted.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

deleteAllData();
