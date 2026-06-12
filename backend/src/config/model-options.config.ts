/**
 * Model options for the Model Provider Selector (Auto, DeepSeek, OpenAI GPT5, Claude, Gemini, Grok, Llama, O-Series, DeepSeek Reasoner).
 * Loaded at startup; env vars override defaults.
 *
 * IMPORTANT: Auto = DeepSeek. The "Auto" option uses the DeepSeek provider and DEEPSEEK_API_KEY.
 */

export type ModelOptionKey = 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini' | 'xai' | 'meta' | 'openai_o' | 'deepseek_reasoner';

/** Keys for models that support chat/completion (not image-generation or other specialty). Used to filter model picker list. */
export const CHAT_CAPABLE_MODEL_KEYS: ModelOptionKey[] = ['auto', 'deepseek', 'openai_gpt5', 'claude', 'gemini', 'xai', 'meta', 'openai_o', 'deepseek_reasoner'];

export function isChatCapableModelKey(key: unknown): key is ModelOptionKey {
  return typeof key === 'string' && CHAT_CAPABLE_MODEL_KEYS.includes(key as ModelOptionKey);
}

export interface ModelOption {
  key: ModelOptionKey;
  label: string;
  provider: 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'xai' | 'meta';
  defaultModel: string;
  apiKeyEnv: string;
  isReasoning?: boolean;
}

function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v && v.trim()) ? v.trim() : fallback;
}

/**
 * Resolve model options with env overrides.
 * Auto uses DeepSeek (same provider and API key as DeepSeek).
 */
export function getModelOptions(): ModelOption[] {
  const deepseekModel = getEnv('DEEPSEEK_MODEL_ID', 'deepseek-v3');
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
      label: 'OpenAI GPT-5',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-5'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_o',
      label: 'OpenAI o4-mini',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_O_MODEL_ID', 'o4-mini'),
      apiKeyEnv: 'OPENAI_API_KEY',
      isReasoning: true,
    },
    {
      key: 'claude',
      label: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_MODEL_ID', 'claude-sonnet-4-5-20250901'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'gemini',
      label: 'Gemini 2.5 Pro',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_MODEL_ID', 'gemini-2.5-pro'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
    {
      key: 'xai',
      label: 'Grok 3',
      provider: 'xai',
      defaultModel: getEnv('XAI_MODEL_ID', 'grok-3'),
      apiKeyEnv: 'XAI_API_KEY',
    },
    {
      key: 'meta',
      label: 'Llama 4 Maverick',
      provider: 'meta',
      defaultModel: getEnv('META_MODEL_ID', 'llama-4-maverick'),
      apiKeyEnv: 'META_API_KEY',
    },
    {
      key: 'deepseek_reasoner',
      label: 'DeepSeek R1',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_REASONER_MODEL_ID', 'deepseek-reasoner'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      isReasoning: true,
    },
  ];
}

export function getOptionByKey(key: string): ModelOption | undefined {
  return getModelOptions().find((o) => o.key === key);
}
