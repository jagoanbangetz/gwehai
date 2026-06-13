/**
 * Model options for the Model Provider Selector.
 * Loaded at startup; env vars override defaults.
 *
 * IMPORTANT: Auto = DeepSeek Chat (deepseek-chat).
 * DeepSeek API only supports: deepseek-v4-pro, deepseek-v4-flash, deepseek-chat
 */

export type ModelOptionKey =
  | 'auto'
  | 'deepseek_v4' | 'deepseek_v4_flash' | 'deepseek_r1' | 'deepseek_chat' | 'deepseek_coder'
  | 'openai_gpt55' | 'openai_gpt5' | 'openai_gpt4o' | 'openai_o3' | 'openai_o4mini' | 'openai_codex'
  | 'claude_fable5' | 'claude_opus48' | 'claude_sonnet4' | 'claude_haiku4'
  | 'gemini_31_pro' | 'gemini_3_flash' | 'gemini_25_pro' | 'gemini_ultra';

/** Keys for models that support chat/completion. */
export const CHAT_CAPABLE_MODEL_KEYS: ModelOptionKey[] = [
  'auto',
  'deepseek_v4', 'deepseek_v4_flash', 'deepseek_r1', 'deepseek_chat', 'deepseek_coder',
  'openai_gpt55', 'openai_gpt5', 'openai_gpt4o', 'openai_o3', 'openai_o4mini', 'openai_codex',
  'claude_fable5', 'claude_opus48', 'claude_sonnet4', 'claude_haiku4',
  'gemini_31_pro', 'gemini_3_flash', 'gemini_25_pro', 'gemini_ultra',
];

export function isChatCapableModelKey(key: unknown): key is ModelOptionKey {
  return typeof key === 'string' && CHAT_CAPABLE_MODEL_KEYS.includes(key as ModelOptionKey);
}

export interface ModelOption {
  key: ModelOptionKey;
  label: string;
  provider: 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'xai' | 'meta' | 'google';
  defaultModel: string;
  apiKeyEnv: string;
  isReasoning?: boolean;
}

function getEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return (v && v.trim()) ? v.trim() : fallback;
}

export function getModelOptions(): ModelOption[] {
  return [
    // ── Auto (default: deepseek-chat) ──
    {
      key: 'auto',
      label: 'Auto',
      provider: 'deepseek',
      defaultModel: getEnv('DEFAULT_AUTO_MODEL', getEnv('DEEPSEEK_CHAT_MODEL_ID', 'deepseek-chat')),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    // ── DeepSeek ──
    {
      key: 'deepseek_v4',
      label: 'DeepSeek V4',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_V4_MODEL_ID', 'deepseek-v4-pro'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_v4_flash',
      label: 'DeepSeek V4 Flash',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_V4_FLASH_MODEL_ID', 'deepseek-v4-flash'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_r1',
      label: 'DeepSeek R1',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_R1_MODEL_ID', 'deepseek-v4-pro'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_chat',
      label: 'DeepSeek Chat',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_CHAT_MODEL_ID', 'deepseek-chat'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    {
      key: 'deepseek_coder',
      label: 'DeepSeek Coder',
      provider: 'deepseek',
      defaultModel: getEnv('DEEPSEEK_CODER_MODEL_ID', 'deepseek-v4-pro'),
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    // ── OpenAI ──
    {
      key: 'openai_gpt55',
      label: 'GPT-5.5',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT55_MODEL_ID', 'gpt-5.5'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_gpt5',
      label: 'GPT-5',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT5_MODEL_ID', 'gpt-5'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_gpt4o',
      label: 'GPT-4o',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_GPT4O_MODEL_ID', 'gpt-4o'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_o3',
      label: 'o3',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_O3_MODEL_ID', 'o3'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_o4mini',
      label: 'o4-mini',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_O4MINI_MODEL_ID', 'o4-mini'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    {
      key: 'openai_codex',
      label: 'Codex',
      provider: 'openai',
      defaultModel: getEnv('OPENAI_CODEX_MODEL_ID', 'codex'),
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    // ── Anthropic ──
    {
      key: 'claude_fable5',
      label: 'Claude Fable 5',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_FABLE5_MODEL_ID', 'claude-fable-5'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'claude_opus48',
      label: 'Claude Opus 4.8',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_OPUS48_MODEL_ID', 'claude-opus-4-8'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'claude_sonnet4',
      label: 'Claude Sonnet 4',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_SONNET4_MODEL_ID', 'claude-sonnet-4'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    {
      key: 'claude_haiku4',
      label: 'Claude Haiku 4',
      provider: 'anthropic',
      defaultModel: getEnv('CLAUDE_HAIKU4_MODEL_ID', 'claude-haiku-4'),
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
    // ── Google AI ──
    {
      key: 'gemini_31_pro',
      label: 'Gemini 3.1 Pro',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_31_PRO_MODEL_ID', 'gemini-3.1-pro'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
    {
      key: 'gemini_3_flash',
      label: 'Gemini 3 Flash',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_3_FLASH_MODEL_ID', 'gemini-3-flash'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
    {
      key: 'gemini_25_pro',
      label: 'Gemini 2.5 Pro',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_25_PRO_MODEL_ID', 'gemini-2.5-pro'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
    {
      key: 'gemini_ultra',
      label: 'Gemini Ultra',
      provider: 'gemini',
      defaultModel: getEnv('GEMINI_ULTRA_MODEL_ID', 'gemini-ultra'),
      apiKeyEnv: 'GEMINI_API_KEY',
    },
  ];
}

export function getOptionByKey(key: string): ModelOption | undefined {
  return getModelOptions().find((o) => o.key === key);
}
