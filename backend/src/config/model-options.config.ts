/**
 * Model options for the Model Provider Selector (Auto, DeepSeek, OpenAI GPT5, Claude).
 * Loaded at startup; env vars override defaults.
 *
 * IMPORTANT: Auto = DeepSeek. The "Auto" option uses the DeepSeek provider and DEEPSEEK_API_KEY.
 */

export type ModelOptionKey = 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini';

export interface ModelOption {
  key: ModelOptionKey;
  label: string;
  provider: 'deepseek' | 'openai' | 'anthropic' | 'gemini';
  defaultModel: string;
  apiKeyEnv: string;
}

function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v && v.trim()) ? v.trim() : fallback;
}

/**
 * Resolve model options with env overrides (DEFAULT_AUTO_MODEL, DEEPSEEK_MODEL_ID, OPENAI_GPT5_MODEL_ID, CLAUDE_MODEL_ID).
 * Auto uses DeepSeek (same provider and API key as DeepSeek).
 */
export function getModelOptions(): ModelOption[] {
  const deepseekModel = getEnv('DEEPSEEK_MODEL_ID', 'deepseek-chat');
  return [
    {
      key: 'auto',
      label: 'Auto',
      provider: 'deepseek', // Auto means DeepSeek: same API and model as DeepSeek
      defaultModel: getEnv('DEFAULT_AUTO_MODEL', deepseekModel),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek',
      label: 'DeepSeek',
      provider: 'deepseek',
      defaultModel: deepseekModel,
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'openai_gpt5',
      label: 'OpenAI GPT5',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-5.1'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'claude',
      label: 'Claude',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_MODEL_ID', 'claude-3-5-sonnet-20241022'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_MODEL_ID', 'gemini-2.0-flash'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
  ];
}

export function getOptionByKey(key: string): ModelOption | undefined {
  return getModelOptions().find((o) => o.key === key);
}
