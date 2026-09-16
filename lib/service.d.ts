/**
 * WebPushService — the host-side core of dsh-web-push.
 *
 * Listens to the same `session/event` stream the dsh-notify-plugin uses and
 * fans important moments out to every registered browser push subscription via
 * the Web Push protocol (VAPID). Delivery is OS-level on the phone: lock
 * screen, banner, sound — no third-party app involved.
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { PluginConfig, StoredSubscription } from './store.js';
export interface NotifyPayload {
    title: string;
    body?: string;
    tag?: string;
    /** Same-origin page the click opens ("/?session=<id>" for deep links). */
    url?: string;
    /** Session id for the click deep link (postMessage'd to a live tab). */
    session?: string;
}
export declare class WebPushService extends Service {
    private config;
    private vapid;
    private subscriptions;
    private listenersRegistered;
    /** Last pushed TODO-list signature per session (progress-only pushes). */
    private lastTodoSignature;
    constructor(ctx: Context, config?: Partial<PluginConfig>);
    /** Effective runtime config (persisted edits already merged by the entry). */
    getConfig(): PluginConfig;
    /** Apply a partial config at runtime and persist it. */
    updateConfig(partial: Partial<PluginConfig>): PluginConfig;
    /** The VAPID public key the browser needs to subscribe. */
    getPublicKey(): string;
    /** Every stored subscription (without per-device secrets exposure beyond keys). */
    listSubscriptions(): Array<Omit<StoredSubscription, 'subscription'>>;
    /** Add or refresh one subscription (keyed by endpoint). */
    addSubscription(subscription: Record<string, unknown>, label: string): void;
    /** Remove one subscription by endpoint (user action or stale cleanup). */
    removeSubscription(endpoint: string): boolean;
    /**
     * Send one notification to every registered device. Best-effort per device:
     * one failing endpoint never blocks the others, and 404/410 endpoints (the
     * push service forgot the subscription) are dropped automatically.
     */
    send(payload: NotifyPayload): Promise<{
        sent: number;
        removed: number;
        errors: string[];
    }>;
    /** Fire a test push from the settings page. */
    sendTest(): Promise<{
        sent: number;
        removed: number;
        errors: string[];
    }>;
    dispose(): Promise<void>;
    private mergeConfig;
    private generateVapid;
    /**
     * The outbound proxy web-push should use to reach the browser push service:
     * explicit config > env (https_proxy / HTTPS_PROXY). web-push's raw node
     * https ignores both the system proxy and NODE_USE_ENV_PROXY, so on networks
     * where fcm.googleapis.com is only reachable through a local proxy (e.g.
     * Clash on 127.0.0.1:7890), direct sends time out with "Socket timeout".
     */
    private resolveProxy;
    private registerEventListeners;
    private handleSessionEvent;
    /**
     * Turn-end push = one line, minimum glyphs: "<icon> <name>". The icon IS
     * the status (✅ completed / ❌ failed / ⏸️ paused), so no status word is
     * spent; the name is hard-capped so auto-generated titles from long
     * prompts can't bloat it. Body stays empty. Clicking deep-links to the
     * session.
     */
    private handleTurnEnd;
    /** Click-target fields shared by every session-scoped push. */
    private deepLink;
    private handleUserQuestion;
    private handleApprovalRequest;
    private handleTodos;
    private workspaceOf;
    private isSubagentSession;
    private parseToolArguments;
    /** One-line session label, hard-capped: session title > workspace > id. */
    private sessionShortName;
    /** Collapse whitespace and cap length — push payloads stay one line. */
    private oneLine;
    private extractErrorMessage;
}
export default WebPushService;
