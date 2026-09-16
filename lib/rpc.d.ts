/**
 * dsh-web-push Web RPC (loopback-only): the settings page ⇄ host channel.
 * Mirrors the dsh-notify-plugin / dsh-pocket RPC pattern:
 *
 *   - host registers a logical channel with `ctx.connection.rpc.handle(channel, handler)`
 *   - the browser bundle calls it with `ctx.connection.rpc.call(channel, endpoint, payload)`
 *
 * THE CONSTANTS BELOW ARE DUPLICATED IN `src/client/client.ts` — the browser
 * bundle cannot import a host file. Keep channel, endpoints, and wire shapes
 * in lockstep across the two.
 */
import type { PluginConfig, StoredSubscription } from './store.js';
import type { IncomingMessage } from 'node:http';
export declare const PUSH_RPC_CHANNEL = "/dsh-web-push";
export declare const PUSH_ENDPOINTS: Readonly<{
    configGet: "push.config.get";
    configSet: "push.config.set";
    vapidKey: "push.vapid.key";
    subscribe: "push.subscribe";
    unsubscribe: "push.unsubscribe";
    list: "push.subscriptions";
    test: "push.test";
}>;
/** The service surface the RPC channel drives. */
export interface PushRpcBridge {
    read(): PluginConfig;
    write(partial: Partial<PluginConfig>): PluginConfig;
    publicKey(): string;
    subscribe(subscription: Record<string, unknown>, label: string): void;
    unsubscribe(endpoint: string): boolean;
    list(): Array<Omit<StoredSubscription, 'subscription'>>;
    test(): Promise<{
        sent: number;
        removed: number;
        errors: string[];
    }>;
}
/**
 * Install the /dsh-web-push logical channel on the host connection.rpc.
 * @returns the channel disposer.
 */
export declare function installPushRpc(rpc: {
    handle(channel: string, handler: (endpoint: string, payload?: unknown, signal?: {
        aborted?: boolean;
    }) => unknown, options?: {
        authority: string;
    }): unknown;
} | undefined, bridge: PushRpcBridge, log?: {
    warn?: (...args: unknown[]) => void;
}): () => void;
/**
 * Mount the /dsh-web-push RPC channel as a webServer prefix route speaking the
 * /api wire protocol (POST {channel}/{endpoint}, {rpcId, method, payload} →
 * {type:'server-response', rpcId, result}). Auth = requestRejection (cookie +
 * Host/Origin) when available, loopback-Host fallback otherwise.
 *
 * @param ctx - host cordis context with `connection` + `webServer` injected.
 * @returns the route disposer, or null when webServer is unavailable (caller
 *          should fall back to installPushRpc).
 */
export declare function installPushHttpRoute(ctx: {
    connection?: {
        requestRejection?: (req: IncomingMessage) => number | undefined;
    };
    webServer?: {
        register(route: unknown): unknown;
    };
}, bridge: PushRpcBridge, log?: {
    warn?: (...args: unknown[]) => void;
}): (() => void) | null;
