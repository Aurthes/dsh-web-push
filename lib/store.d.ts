/**
 * Persistence for dsh-web-push: VAPID keys, browser push subscriptions, and
 * the user's config edits. Files live under <DSH_HOME>/web-push/ and are the
 * plugin's private state — nothing else reads them.
 */
/** One browser push subscription (the PushSubscription.toJSON() blob). */
export interface StoredSubscription {
    /** The push service endpoint URL (unique per subscription). */
    endpoint: string;
    /** Human label captured at subscribe time (device hint). */
    label: string;
    /** Epoch ms when the subscription was registered. */
    subscribedAt: number;
    /** PushSubscription.toJSON() — { endpoint, keys: { p256dh, auth }, ... }. */
    subscription: Record<string, unknown>;
    /** Epoch ms of the most recent delivery attempt (success or failure). */
    lastSendAt?: number;
    /** Whether the most recent attempt reached the push service. */
    lastSendOk?: boolean;
    /** Failure detail of the most recent attempt, when it failed. */
    lastError?: string;
}
/** VAPID keypair identifying this DSH instance as the push sender. */
export interface VapidKeys {
    publicKey: string;
    privateKey: string;
}
/** Event filter keys — mirrors the dsh-notify-plugin event names. */
export interface EventFilter {
    conversationCompleted: boolean;
    conversationPaused: boolean;
    conversationFailed: boolean;
    authorizationRequired: boolean;
    confirmationRequired: boolean;
    todoProgress: boolean;
}
export interface PluginConfig {
    enabled: boolean;
    events: EventFilter;
    /** Only the main agent's turn endings/todo progress push (prompts always push). */
    mainAgentOnly: boolean;
    titlePrefix: string;
    /**
     * Outbound proxy for the push service (e.g. http://127.0.0.1:7890). Empty
     * = auto (env https_proxy/HTTPS_PROXY). web-push's node https ignores the
     * system proxy, so on networks where the push service is only reachable
     * through a local proxy, direct sends time out.
     */
    proxyUrl: string;
}
export declare const DEFAULT_CONFIG: PluginConfig;
/** Resolve DSH_HOME, falling back to ~/.dsh (same rule as dsh-notify-plugin). */
export declare function dshHome(): string;
/** Load the persisted VAPID keypair, or null before the first generate. */
export declare function loadVapid(): VapidKeys | null;
export declare function saveVapid(keys: VapidKeys): void;
/** Load every stored subscription. */
export declare function loadSubscriptions(): StoredSubscription[];
export declare function saveSubscriptions(subs: StoredSubscription[]): void;
/** Load the persisted config (partial) for merging over defaults. */
export declare function loadConfig(): Partial<PluginConfig> | null;
export declare function saveConfig(config: PluginConfig): void;
