export type AIProvider = 'gpt' | 'claude' | 'ollama'
export type RouteMode  = 'single' | 'dual' | 'triple' | 'early-exit' | 'cached' | 'explore' | 'direct'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface AIRequest {
  messages: Message[]
  context?: string | null
}

export interface AIResponse {
  reply:      string
  provider:   AIProvider
  mode?:      RouteMode
  confidence?: number | null
  latency_ms?: number
  cached?:    boolean
  cost_usd?:  number
}

export interface RouterResponse extends AIResponse {
  complexity?: 'simple' | 'medium' | 'complex'
  category?:  string
  explore?:   boolean
  tokens?:    number
  both?: {
    gpt?:    string
    claude?: string
    ollama?: string | null
  }
}
