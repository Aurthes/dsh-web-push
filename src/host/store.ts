/**
 * Persistence for dsh-web-push: VAPID keys, browser push subscriptions, and
 * the user's config edits. Files live under <DSH_HOME>/web-push/ and are the
 * plugin's private state — nothing else reads them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** One browser push subscription (the PushSubscription.toJSON() blob). */
export interface StoredSubscription {
  /** The push service endpoint URL (unique per subscription). */
  endpoint: string
  /** Human label captured at subscribe time (device hint). */
  label: string
  /** Epoch ms when the subscription was registered. */
  subscribedAt: number
  /** PushSubscription.toJSON() — { endpoint, keys: { p256dh, auth }, ... }. */
  subscription: Record<string, unknown>
  /** Epoch ms of the most recent delivery attempt (success or failure). */
  lastSendAt?: number
  /** Whether the most recent attempt reached the push service. */
  lastSendOk?: boolean
  /** Failure detail of the most recent attempt, when it failed. */
  lastError?: string
}

/** VAPID keypair identifying this DSH instance as the push sender. */
export interface VapidKeys {
  publicKey: string
  privateKey: string
}

/** Event filter keys — mirrors the dsh-notify-plugin event names. */
export interface EventFilter {
  conversationCompleted: boolean
  conversationPaused: boolean
  conversationFailed: boolean
  authorizationRequired: boolean
  confirmationRequired: boolean
  todoProgress: boolean
}

export interface PluginConfig {
  enabled: boolean
  events: EventFilter
  /** Only the main agent's turn endings/todo progress push (prompts always push). */
  mainAgentOnly: boolean
  titlePrefix: string
  /**
   * Outbound proxy for the push service (e.g. http://127.0.0.1:7890). Empty
   * = auto (env https_proxy/HTTPS_PROXY). web-push's node https ignores the
   * system proxy, so on networks where the push service is only reachable
   * through a local proxy, direct sends time out.
   */
  proxyUrl: string
}

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  events: {
    conversationCompleted: true,
    conversationPaused: true,
    conversationFailed: true,
    authorizationRequired: true,
    confirmationRequired: true,
    todoProgress: true,
  },
  mainAgentOnly: true,
  titlePrefix: '',
  proxyUrl: '',
}

/** Resolve DSH_HOME, falling back to ~/.dsh (same rule as dsh-notify-plugin). */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

function stateDir(): string {
  return join(dshHome(), 'web-push')
}

function stateFile(name: string): string {
  return join(stateDir(), name)
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** Load the persisted VAPID keypair, or null before the first generate. */
export function loadVapid(): VapidKeys | null {
  return readJson<VapidKeys>(stateFile('vapid.json'))
}

export function saveVapid(keys: VapidKeys): void {
  writeJson(stateFile('vapid.json'), keys)
}

/** Load every stored subscription. */
export function loadSubscriptions(): StoredSubscription[] {
  const stored = readJson<{ subscriptions?: StoredSubscription[] }>(stateFile('subscriptions.json'))
  return Array.isArray(stored?.subscriptions) ? stored!.subscriptions! : []
}

export function saveSubscriptions(subs: StoredSubscription[]): void {
  writeJson(stateFile('subscriptions.json'), { subscriptions: subs })
}

/** Load the persisted config (partial) for merging over defaults. */
export function loadConfig(): Partial<PluginConfig> | null {
  return readJson<Partial<PluginConfig>>(stateFile('config.json'))
}

export function saveConfig(config: PluginConfig): void {
  writeJson(stateFile('config.json'), config)
}
