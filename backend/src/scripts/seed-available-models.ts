/**
 * Seed chat models for the picker: Auto, DeepSeek V3, DeepSeek Reasoner (R1), GPT-5, GPT-4.1, o3-mini, o4-mini,
 * Claude Sonnet 4.5, Claude 3.5 Haiku, Gemini 2.5 Pro, Gemini 2.5 Flash, Grok 3, Llama 4 Maverick.
 * - DeepSeek: Auto = deepseek-v3, plus deepseek-reasoner (R1). All use DEEPSEEK_API_KEY.
 * - OpenAI: GPT-5, GPT-4.1, o3-mini, o4-mini. All use OPENAI_API_KEY.
 * - Anthropic: Claude Sonnet 4.5, Claude 3.5 Haiku. All use ANTHROPIC_API_KEY.
 * - Google: Gemini 2.5 Pro, Gemini 2.5 Flash. All use GEMINI_API_KEY.
 * - xAI: Grok 3. Uses XAI_API_KEY (OpenAI-compatible API at api.x.ai).
 * - Meta: Llama 4 Maverick. Uses META_API_KEY + META_BASE_URL (OpenAI-compatible, e.g. Groq/Together).
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

// Picker models. DeepSeek options use key 'auto' (same API, different model id). All OpenAI models use key 'openai' (same API key).
const MODELS: ModelSeedRow[] = [
  // --- Auto (default) ---
  { name: 'auto/deepseek', displayName: 'Auto', provider: ModelProvider.CUSTOM, key: 'auto', apiModelId: getEnv('DEFAULT_AUTO_MODEL', getEnv('DEEPSEEK_MODEL_ID', 'deepseek-v3')), pointsPer1kInput: 3, pointsPer1kOutput: 6 },

  // --- DeepSeek ---
  { name: 'deepseek/v3', displayName: 'DeepSeek V3', provider: ModelProvider.CUSTOM, key: 'deepseek', apiModelId: getEnv('DEEPSEEK_MODEL_ID', 'deepseek-v3'), pointsPer1kInput: 3, pointsPer1kOutput: 6 },
  { name: 'deepseek/reasoner', displayName: 'DeepSeek Reasoner (R1)', provider: ModelProvider.CUSTOM, key: 'auto', apiModelId: 'deepseek-reasoner', pointsPer1kInput: 6, pointsPer1kOutput: 44 },

  // --- OpenAI ---
  { name: 'openai/gpt-5', displayName: 'GPT-5', provider: ModelProvider.OPENAI, key: 'openai_gpt5', apiModelId: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-5'), pointsPer1kInput: 50, pointsPer1kOutput: 200 },
  { name: 'openai/gpt-4.1', displayName: 'GPT-4.1', provider: ModelProvider.OPENAI, key: 'openai_gpt5', apiModelId: 'gpt-4.1', pointsPer1kInput: 40, pointsPer1kOutput: 160 },
  { name: 'openai/o3-mini', displayName: 'o3-mini', provider: ModelProvider.OPENAI, key: 'openai_gpt5', apiModelId: 'o3-mini', pointsPer1kInput: 22, pointsPer1kOutput: 88 },
  { name: 'openai/o4-mini', displayName: 'o4-mini', provider: ModelProvider.OPENAI, key: 'openai_o', apiModelId: 'o4-mini', pointsPer1kInput: 22, pointsPer1kOutput: 88 },

  // --- Anthropic ---
  { name: 'anthropic/claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', provider: ModelProvider.ANTHROPIC, key: 'claude', apiModelId: getEnv('CLAUDE_MODEL_ID', 'claude-sonnet-4-5-20250901'), pointsPer1kInput: 60, pointsPer1kOutput: 300 },
  { name: 'anthropic/claude-haiku-3.5', displayName: 'Claude 3.5 Haiku', provider: ModelProvider.ANTHROPIC, key: 'claude', apiModelId: 'claude-3-5-haiku-20241022', pointsPer1kInput: 8, pointsPer1kOutput: 40 },

  // --- Google ---
  { name: 'google/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: ModelProvider.GOOGLE, key: 'gemini', apiModelId: getEnv('GEMINI_MODEL_ID', 'gemini-2.5-flash'), pointsPer1kInput: 2, pointsPer1kOutput: 8 },
  { name: 'google/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: ModelProvider.GOOGLE, key: 'gemini', apiModelId: 'gemini-2.5-pro', pointsPer1kInput: 25, pointsPer1kOutput: 200 },

  // --- xAI (OpenAI-compatible API) ---
  { name: 'xai/grok-3', displayName: 'Grok 3', provider: ModelProvider.CUSTOM, key: 'xai', apiModelId: 'grok-3', pointsPer1kInput: 60, pointsPer1kOutput: 300 },

  // --- Meta (OpenAI-compatible via Groq/Together/etc.) ---
  { name: 'meta/llama-4-maverick', displayName: 'Llama 4 Maverick', provider: ModelProvider.CUSTOM, key: 'meta', apiModelId: getEnv('META_MODEL_ID', 'llama-4-maverick'), pointsPer1kInput: 4, pointsPer1kOutput: 12 },
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
    key === 'gemini' ? 'gemini' : key === 'auto' || key === 'deepseek' || key === 'deepseek_reasoner' ? 'deepseek' : key === 'claude' ? 'anthropic' : key === 'xai' ? 'xai' : key === 'meta' ? 'meta' : 'openai';

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

  console.log('\nDone. Picker shows: Auto, DeepSeek R1, GPT-5, GPT-4.1, o3-mini, o4-mini, Claude Sonnet 4.5, Claude 3.5 Haiku, Gemini 2.5 Pro, Gemini 2.5 Flash, Grok 3, Llama 4 Maverick.');
  await dataSource.destroy();
  process.exit(0);
}

seedAvailableModels().catch((err) => {
  console.error(err);
  process.exit(1);
});
