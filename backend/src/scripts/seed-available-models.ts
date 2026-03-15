/**
 * Seed chat models for the picker: Auto, DeepSeek Reasoner, DeepSeek Coder, GPT-4o, Claude Opus 4.5, Gemini 2.5 Flash.
 * - GPT-4o: supports function calling (tools) for pentest. GPT-5-class reasoning (o1) may need different API.
 * - DeepSeek: Auto = deepseek-chat, plus deepseek-reasoner (R1) and deepseek-coder. All use DEEPSEEK_API_KEY.
 * Run: npm run db:seed-models
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { Model, ModelProvider } from '../entities/model.entity';

interface ModelSeedRow {
  name: string;
  displayName: string;
  provider: ModelProvider;
  key: string;
  apiModelId: string;
  pointsPer1kInput: number;
  pointsPer1kOutput: number;
}

function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v && String(v).trim()) ? String(v).trim() : fallback;
}

// Picker models. DeepSeek options use key 'auto' (same API, different model id). GPT-4o supports tools for pentest.
const MODELS: ModelSeedRow[] = [
  { name: 'auto/deepseek', displayName: 'Auto', provider: ModelProvider.CUSTOM, key: 'auto', apiModelId: getEnv('DEFAULT_AUTO_MODEL', getEnv('DEEPSEEK_MODEL_ID', 'deepseek-chat')), pointsPer1kInput: 3, pointsPer1kOutput: 6 },
  { name: 'deepseek/reasoner', displayName: 'DeepSeek Reasoner', provider: ModelProvider.CUSTOM, key: 'auto', apiModelId: 'deepseek-reasoner', pointsPer1kInput: 6, pointsPer1kOutput: 44 },
  { name: 'deepseek/coder', displayName: 'DeepSeek Coder', provider: ModelProvider.CUSTOM, key: 'auto', apiModelId: 'deepseek-coder', pointsPer1kInput: 3, pointsPer1kOutput: 6 },
  { name: 'openai/gpt-4o', displayName: 'GPT-4o', provider: ModelProvider.OPENAI, key: 'openai_gpt5', apiModelId: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-4o'), pointsPer1kInput: 50, pointsPer1kOutput: 200 },
  { name: 'anthropic/claude-opus-4-5', displayName: 'Claude Opus 4.5', provider: ModelProvider.ANTHROPIC, key: 'claude', apiModelId: getEnv('CLAUDE_MODEL_ID', 'claude-opus-4-5-20251101'), pointsPer1kInput: 60, pointsPer1kOutput: 300 },
  { name: 'gemini/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: ModelProvider.GOOGLE, key: 'gemini', apiModelId: getEnv('GEMINI_MODEL_ID', 'gemini-2.5-flash'), pointsPer1kInput: 2, pointsPer1kOutput: 8 },
];

async function seedAvailableModels() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'gwehai',
    password: process.env.DB_PASSWORD || 'gwehai_dev_password',
    database: process.env.DB_DATABASE || 'gwehai_db',
    entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  console.log('Connected to database\n');

  const modelRepo = dataSource.getRepository(Model);
  const allowedNames = new Set(MODELS.map((r) => r.name));

  // Deactivate any model not in our list so they disappear from the picker.
  const all = await modelRepo.find();
  for (const m of all) {
    if (!allowedNames.has(m.name)) {
      m.isActive = false;
      await modelRepo.save(m);
      console.log('  Deactivated: ' + m.name);
    }
  }

  const metadataProvider = (key: string) =>
    key === 'gemini' ? 'gemini' : key === 'auto' ? 'deepseek' : key === 'claude' ? 'anthropic' : 'openai';

  for (const row of MODELS) {
    const isDefault = row.name === 'auto/deepseek';
    const existing = await modelRepo.findOne({ where: { name: row.name } });
    const metadata = { key: row.key, provider: metadataProvider(row.key), apiModelId: row.apiModelId, defaultModel: row.apiModelId };
    if (existing) {
      existing.displayName = row.displayName;
      existing.provider = row.provider;
      existing.metadata = { ...(existing.metadata || {}), ...metadata };
      existing.isDefault = isDefault;
      existing.isActive = true;
      existing.pointsPer1kInputTokens = row.pointsPer1kInput as any;
      existing.pointsPer1kOutputTokens = row.pointsPer1kOutput as any;
      await modelRepo.save(existing);
      console.log('  Updated: ' + row.name + ' - ' + row.displayName + ' (points ' + row.pointsPer1kInput + '/' + row.pointsPer1kOutput + ' per 1k)');
    } else {
      const model = modelRepo.create({
        name: row.name,
        displayName: row.displayName,
        provider: row.provider,
        pointsPer1kInputTokens: row.pointsPer1kInput,
        pointsPer1kOutputTokens: row.pointsPer1kOutput,
        isActive: true,
        isDefault: isDefault,
        metadata,
      });
      await modelRepo.save(model);
      console.log('  Created: ' + row.name + ' - ' + row.displayName + ' (' + row.apiModelId + ')');
    }
  }

  console.log('\nDone. Picker shows: Auto, DeepSeek Reasoner, DeepSeek Coder, GPT-4o, Claude Opus 4.5, Gemini 2.5 Flash.');
  await dataSource.destroy();
  process.exit(0);
}

seedAvailableModels().catch((err) => {
  console.error(err);
  process.exit(1);
});
