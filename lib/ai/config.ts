/**
 * lib/ai/config.ts
 * Single source of truth for all AI provider configuration.
 * Throws at module-load time if required keys are missing.
 */

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const Config = {
  openai: {
    apiKey:  requireEnv('OPENAI_API_KEY'),
    model:   optionalEnv('OPENAI_MODEL', 'gpt-4o'),
    timeout: parseInt(optionalEnv('AI_TIMEOUT_MS', '15000'))
  },
  anthropic: {
    apiKey:  requireEnv('ANTHROPIC_API_KEY'),
    model:   optionalEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
    timeout: parseInt(optionalEnv('AI_TIMEOUT_MS', '15000'))
  },
  ollama: {
    url:     optionalEnv('OLLAMA_URL',   'http://localhost:11434'),
    model:   optionalEnv('OLLAMA_MODEL', 'qwen2.5:72b'),
    enabled: process.env.OLLAMA_ENABLED === 'true',
    timeout: parseInt(optionalEnv('AI_TIMEOUT_MS', '15000'))
  },
  router: {
    dualEnabled:        process.env.DUAL_ENABLED !== 'false',
    triplebudgetMs:     parseInt(optionalEnv('TRIPLE_BUDGET_MS',        '6000')),
    earlyExitConf:      parseFloat(optionalEnv('EARLY_EXIT_CONFIDENCE', '0.90')),
    confidenceFloor:    parseFloat(optionalEnv('CONFIDENCE_FLOOR',      '0.65')),
    learnedTrust:       parseFloat(optionalEnv('LEARNED_TRUST',         '0.75')),
    exploreRate:        parseFloat(optionalEnv('EXPLORE_RATE',          '0.10')),
    compressAfter:      parseInt(optionalEnv('COMPRESS_AFTER',          '20')),
    keepRecent:         parseInt(optionalEnv('KEEP_RECENT',             '6')),
    ctxWindow:          parseInt(optionalEnv('CTX_WINDOW',              '10'))
  }
} as const
