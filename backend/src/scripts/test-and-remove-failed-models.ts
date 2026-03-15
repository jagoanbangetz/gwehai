/**
 * Test each model in the database with a minimal API call.
 * If the provider returns an error (model not found, not supported, etc.), remove the model from the database.
 * Run: npm run db:test-models
 * Requires: OPENAI_API_KEY and/or GEMINI_API_KEY in .env (only tests models for which the key is set).
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { Model, ModelProvider } from '../entities/model.entity';

const TEST_PROMPT = 'Reply with exactly: OK';
const MAX_TOKENS = 10;

async function testOpenAIModel(apiKey: string, apiModelId: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
  const messages = [{ role: 'user' as const, content: TEST_PROMPT }];
  // Newer models use max_completion_tokens; older use max_tokens. Try both on param errors.
  const tryBody = async (body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const errText = await res.text();
    if (!res.ok) {
      let errMsg = errText;
      try {
        const j = JSON.parse(errText);
        errMsg = j?.error?.message ?? j?.message ?? errText;
      } catch (_) {}
      return { ok: false as const, error: errMsg };
    }
    const data = JSON.parse(errText || '{}');
    const choice = data?.choices?.[0];
    if (!choice?.message) {
      return { ok: false as const, error: 'No choices in response' };
    }
    return { ok: true as const };
  };
  let result = await tryBody({ model: apiModelId, messages, max_completion_tokens: MAX_TOKENS });
  if (!result.ok && /max_tokens.*not supported|use 'max_c/i.test(result.error || '')) {
    result = await tryBody({ model: apiModelId, messages, max_tokens: MAX_TOKENS });
  }
  return result;
}

async function testGeminiModel(apiKey: string, apiModelId: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModelId}:generateContent`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText;
      try {
        const j = JSON.parse(errText);
        errMsg = j?.error?.message ?? j?.message ?? errText;
      } catch (_) {}
      return { ok: false, error: errMsg };
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const hasText = parts.some((p: any) => p.text != null);
    if (!hasText) {
      const reason = data?.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'OTHER') {
        return { ok: true };
      }
      return { ok: false, error: 'No content in response' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function main() {
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
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  const all = await modelRepo.find({
    where: { isActive: true },
    order: { displayName: 'ASC' },
  });

  const testable = all.filter((m) => {
    const meta = m.metadata as Record<string, string> | null;
    if (!meta?.key || !meta?.apiModelId) return false;
    if (meta.key === 'openai_gpt5') return !!openaiKey;
    if (meta.key === 'gemini') return !!geminiKey;
    return false;
  });

  if (testable.length === 0) {
    console.log('No models to test (set OPENAI_API_KEY and/or GEMINI_API_KEY and run db:seed-models first).');
    await dataSource.destroy();
    process.exit(0);
    return;
  }

  if (!openaiKey && all.some((m) => (m.metadata as any)?.key === 'openai_gpt5')) {
    console.log('⚠ OPENAI_API_KEY not set — skipping OpenAI models.\n');
  }
  if (!geminiKey && all.some((m) => (m.metadata as any)?.key === 'gemini')) {
    console.log('⚠ GEMINI_API_KEY not set — skipping Gemini models.\n');
  }

  let passed = 0;
  const toRemove: Model[] = [];

  for (const model of testable) {
    const meta = model.metadata as Record<string, string>;
    const key = meta.key;
    const apiModelId = meta.apiModelId;
    const label = model.displayName || model.name;

    process.stdout.write(`Testing ${label} (${apiModelId})... `);

    let result: { ok: boolean; error?: string };
    if (key === 'openai_gpt5') {
      result = await testOpenAIModel(openaiKey, apiModelId);
    } else if (key === 'gemini') {
      result = await testGeminiModel(geminiKey, apiModelId);
    } else {
      result = { ok: false, error: 'Unsupported key' };
    }

    if (result.ok) {
      console.log('OK');
      passed++;
    } else {
      console.log('FAIL:', result.error?.slice(0, 80) || 'unknown');
      toRemove.push(model);
    }
  }

  if (toRemove.length > 0) {
    console.log(`\nRemoving ${toRemove.length} model(s) that failed or are not supported:\n`);
    for (const m of toRemove) {
      console.log(`  - ${m.displayName || m.name} (${m.id})`);
      await modelRepo.remove(m);
    }
    console.log('\n✅ Removed failed models from database.');
  } else {
    console.log('\n✅ All tested models are supported. None removed.');
  }

  console.log(`\nSummary: ${passed} passed, ${toRemove.length} removed.`);
  await dataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
