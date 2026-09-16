/**
 * dsh-web-push — DeepSeek Harness plugin.
 *
 * Delivers OS-level push notifications to your phone straight from the DSH web
 * origin via the W3C Web Push protocol (VAPID). No third-party app: on
 * Android the site itself asks for notification permission; on iOS 16.4+ the
 * web app must be added to the home screen first (an Apple requirement).
 *
 * Host plane responsibilities:
 *   - listen to `session/event` and pick the moments worth a push
 *   - persist VAPID keys + browser subscriptions under <DSH_HOME>/web-push/
 *   - serve the service worker / manifest / icon over webServer routes
 *   - expose the /dsh-web-push RPC channel for the settings page
 */
import { WebPushService } from './service.js';
import { installPushRpc, installPushHttpRoute, PUSH_RPC_CHANNEL } from './rpc.js';
import { ICON_SVG, manifestSource, serviceWorkerSource } from './assets.js';
/** Host services this plugin depends on (same pair dsh-pocket/notify use). */
export const inject = ['connection', 'webServer'];
function serviceOf(ctx, name) {
    try {
        return ctx.get(name);
    }
    catch {
        return null;
    }
}
/** Send a UTF-8 body with the given content type. */
function respond(res, status, contentType, body, extraHeaders = {}) {
    res.writeHead(status, {
        'content-type': contentType,
        'cache-control': 'no-store',
        ...extraHeaders,
    });
    res.end(body);
}
export default function webPushPlugin(ctx, config) {
    const service = new WebPushService(ctx, config);
    // Settings-page RPC channel.
    const connection = serviceOf(ctx, 'connection');
    const bridge = {
        read: () => service.getConfig(),
        write: (partial) => service.updateConfig(partial),
        publicKey: () => service.getPublicKey(),
        subscribe: (subscription, label) => service.addSubscription(subscription, label),
        unsubscribe: (endpoint) => service.removeSubscription(endpoint),
        list: () => service.listSubscriptions(),
        test: () => service.sendTest(),
    };
    const log = { warn: (...args) => ctx.logger.warn(...args) };
    // HTTP routes for the browser: service worker, manifest, icon.
    const webServer = serviceOf(ctx, 'webServer');
    const disposers = [];
    // RPC transport — pocket-style, in order of preference:
    //   1. own webServer prefix route (cookie fence via requestRejection). Works
    //      from the phone (dsh-pocket LAN / public tunnel origins); registering
    //      through connection.rpc.handle instead would hard-reject non-loopback
    //      Hosts (401 regardless of a valid browser cookie).
    //   2. connection.rpc.handle fallback when webServer is unavailable.
    // Exactly ONE of the two may be active — both would collide on the route.
    let disposeRpc = () => { };
    const httpRoute = installPushHttpRoute({ connection, webServer }, bridge, log);
    if (httpRoute) {
        disposers.push(httpRoute);
    }
    else {
        disposeRpc = installPushRpc(connection?.rpc, bridge, log);
    }
    if (webServer && typeof webServer.register === 'function') {
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/dsh-web-push/sw.js',
            handler: (_req, res) => {
                // Service-Worker-Allowed widens the max scope to '/' so the settings
                // page may register with a root scope if a future DSH composition
                // needs it; the default directory scope already suffices for push.
                respond(res, 200, 'application/javascript; charset=utf-8', serviceWorkerSource(), {
                    'service-worker-allowed': '/',
                });
            },
        }));
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/dsh-web-push/manifest.webmanifest',
            handler: (_req, res) => respond(res, 200, 'application/manifest+json; charset=utf-8', manifestSource()),
        }));
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/dsh-web-push/icon.svg',
            handler: (_req, res) => respond(res, 200, 'image/svg+xml', ICON_SVG, { 'cache-control': 'public, max-age=86400' }),
        }));
    }
    else {
        ctx.logger.warn('[web-push] webServer service unavailable — service worker route not mounted (push disabled)');
    }
    ctx.effect(() => {
        return async () => {
            for (const dispose of disposers)
                dispose();
            disposeRpc();
            await service.dispose();
        };
    }, 'web-push plugin cleanup');
    ctx.logger.info(`[web-push] ready on RPC channel ${PUSH_RPC_CHANNEL} (devices: ${service.listSubscriptions().length})`);
    return service;
}
// Cordis reads `plugin.inject` off the plugin function (function-form plugin).
;
webPushPlugin.inject = inject;
export { WebPushService } from './service.js';
export { PUSH_RPC_CHANNEL, PUSH_ENDPOINTS } from './rpc.js';
export * from './store.js';
export * from './assets.js';
