/**
 * Model options for the Model Provider Selector (Auto, DeepSeek, OpenAI GPT5, Claude).
 * Loaded at startup; env vars override defaults.
 */

export type ModelOptionKey = 'auto' | 'deepseek' | 'openai_gpt5' | 'claude';

export interface ModelOption {
  key: ModelOptionKey;
  label: string;
  provider: 'groq' | 'deepseek' | 'openai' | 'anthropic';
  defaultModel: string;
  apiKeyEnv: string;
}

const DEFAULT_OPTIONS: ModelOption[] = [
  { key: 'auto', label: 'Auto', provider: 'groq', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY' },
  { key: 'deepseek', label: 'DeepSeek', provider: 'deepseek', defaultModel: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  { key: 'openai_gpt5', label: 'OpenAI GPT5', provider: 'openai', defaultModel: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
  { key: 'claude', label: 'Claude', provider: 'anthropic', defaultModel: 'claude-3-5-sonnet-20241022', apiKeyEnv: 'ANTHROPIC_API_KEY' },
];

function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v && v.trim()) ? v.trim() : fallback;
}

/**
 * Resolve model options with env overrides (DEFAULT_AUTO_MODEL, AUTO_CHEAP_MODEL, OPENAI_GPT5_MODEL_ID, DEEPSEEK_MODEL_ID, CLAUDE_MODEL_ID).
 */
export function getModelOptions(): ModelOption[] {
  return [
    {
      key: 'auto',
      label: 'Auto',
      provider: 'groq',
      defaultModel: getEnv('DEFAULT_AUTO_MODEL', 'llama-3.3-70b-versatile'),
      apiKeyEnv: 'GROQ_API_KEY',
    },
    {
      key: 'deepseek',
      label: 'DeepSeek',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_MODEL_ID', 'deepseek-chat'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'openai_gpt5',
      label: 'OpenAI GPT5',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-4o'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'claude',
      label: 'Claude',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_MODEL_ID', 'claude-3-5-sonnet-20241022'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
  ];
}

export function getAutoCheapModel(): string {
  return getEnv('AUTO_CHEAP_MODEL', 'llama-3.1-8b-instant');
}

export function getOptionByKey(key: string): ModelOption | undefined {
  return getModelOptions().find((o) => o.key === key);
}
