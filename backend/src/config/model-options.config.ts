/**
 * Model options for the Model Provider Selector.
 * Loaded at startup; env vars override defaults.
 *
 * IMPORTANT: Auto = DeepSeek V4 Pro.
 * DeepSeek API only supports: deepseek-v4-pro, deepseek-v4-flash
 */

export type ModelOptionKey = 'auto' | 'deepseek' | 'deepseek_v4' | 'deepseek_v4_pro' | 'openai_gpt5' | 'claude' | 'gemini' | 'xai' | 'meta' | 'openai_o' | 'deepseek_reasoner';

/** Keys for models that support chat/completion. */
export const CHAT_CAPABLE_MODEL_KEYS: ModelOptionKey[] = ['auto', 'deepseek', 'deepseek_v4', 'deepseek_v4_pro', 'openai_gpt5', 'claude', 'gemini', 'xai', 'meta', 'openai_o', 'deepseek_reasoner'];

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
 * Auto uses DeepSeek V4 Pro.
 * DeepSeek API only supports deepseek-v4-pro and deepseek-v4-flash — V3 & R1 are REMAPPED.
 */
export function getModelOptions(): ModelOption[] {
  return [
    {
      key: 'auto',
      label: 'Auto',
      provider: 'deepseek',
      defaultModel: getEnv('DEFAULT_AUTO_MODEL', getEnv('DEEPSEEK_V4_PRO_MODEL_ID', 'deepseek-v4-pro')),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek',
      label: 'DeepSeek V3',
      provider: 'deepseek',
      // V3 no longer available — use V4 Flash as fallback
      defaultModel: getEnv('DEEPSEEK_V3_MODEL_ID', 'deepseek-v4-flash'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_v4',
      label: 'DeepSeek V4',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_V4_MODEL_ID', 'deepseek-v4-flash'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_v4_pro',
      label: 'DeepSeek V4 Pro',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_V4_PRO_MODEL_ID', 'deepseek-v4-pro'),
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
      // R1 no longer available — use V4 Pro as fallback
      defaultModel: getEnv('DEEPSEEK_REASONER_MODEL_ID', 'deepseek-v4-pro'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      isReasoning: true,
    },
  ];
}

export function getOptionByKey(key: string): ModelOption | undefined {
  return getModelOptions().find((o) => o.key === key);
}
