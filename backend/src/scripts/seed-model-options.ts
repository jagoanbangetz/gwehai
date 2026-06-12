/**
 * Seed the 5 model options for the Model Provider Selector (Auto, DeepSeek, OpenAI GPT5, Claude, Gemini).
 * If the project has a DB, run: npx ts-node src/scripts/seed-model-options.ts
 * Options are also available via config (getModelOptions()) at startup without DB.
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { Model, ModelProvider } from '../entities/model.entity';
import { getModelOptions } from '../config/model-options.config';

const MODEL_OPTION_NAMES = ['model-picker/auto', 'model-picker/deepseek', 'model-picker/deepseek_v4', 'model-picker/deepseek_v4_pro', 'model-picker/openai_gpt5', 'model-picker/openai_o', 'model-picker/claude', 'model-picker/gemini', 'model-picker/xai', 'model-picker/meta', 'model-picker/deepseek_reasoner'] as const;

async function seedModelOptions() {
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
  console.log('✅ Connected to database\n');

  const modelRepo = dataSource.getRepository(Model);
  const options = getModelOptions();

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const name = MODEL_OPTION_NAMES[i] ?? `model-picker/${opt.key}`;
    const existing = await modelRepo.findOne({ where: { name } });
    if (existing) {
      console.log(`  Skip (exists): ${name} - ${opt.label}`);
      continue;
    }
    const provider =
      opt.provider === 'openai'
        ? ModelProvider.OPENAI
        : opt.provider === 'anthropic'
          ? ModelProvider.ANTHROPIC
          : opt.provider === 'gemini'
            ? ModelProvider.GOOGLE
            : ModelProvider.CUSTOM;
    const model = modelRepo.create({
      name,
      displayName: opt.label,
      provider,
      pointsPer1kInputTokens: 0,
      pointsPer1kOutputTokens: 0,
      isActive: true,
      isDefault: false,
      metadata: { key: opt.key, provider: opt.provider, defaultModel: opt.defaultModel },
    });
    await modelRepo.save(model);
    console.log(`  Created: ${name} - ${opt.label} (${opt.provider})`);
  }

  console.log('\n✅ Model options seed done.');
  await dataSource.destroy();
  process.exit(0);
}

seedModelOptions().catch((err) => {
  console.error(err);
  process.exit(1);
});
