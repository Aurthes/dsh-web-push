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
export const PUSH_RPC_CHANNEL = '/dsh-web-push';
export const PUSH_ENDPOINTS = Object.freeze({
    configGet: 'push.config.get',
    configSet: 'push.config.set',
    vapidKey: 'push.vapid.key',
    subscribe: 'push.subscribe',
    unsubscribe: 'push.unsubscribe',
    list: 'push.subscriptions',
    test: 'push.test',
});
/** DSH rpcErrorSchema-discriminated failure. */
function ok(value) {
    return { ok: true, value };
}
function fail(message) {
    return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } };
}
/**
 * Install the /dsh-web-push logical channel on the host connection.rpc.
 * @returns the channel disposer.
 */
export function installPushRpc(rpc, bridge, log = {}) {
    if (rpc?.handle === undefined) {
        log.warn?.('[web-push] DSH Host Connection RPC unavailable — settings page disabled | 无 Connection RPC，设置页不可用');
        return () => { };
    }
    const dispose = rpc.handle(PUSH_RPC_CHANNEL, pushRpcHandler(bridge), { authority: 'loopback' });
    return () => { void dispose; };
}
/** Shared endpoint dispatcher for both transports (rpc.handle and HTTP route). */
function pushRpcHandler(bridge) {
    return async (endpoint, payload = {}, signal) => {
        if (signal?.aborted)
            return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.', details: {} } };
        switch (endpoint) {
            case PUSH_ENDPOINTS.configGet:
                return ok(bridge.read());
            case PUSH_ENDPOINTS.configSet: {
                if (payload === null || typeof payload !== 'object')
                    return fail('push.config.set expects an object payload');
                return ok(bridge.write(payload));
            }
            case PUSH_ENDPOINTS.vapidKey:
                return ok({ publicKey: bridge.publicKey() });
            case PUSH_ENDPOINTS.subscribe: {
                const subscription = payload?.subscription;
                if (subscription === null || typeof subscription !== 'object')
                    return fail('push.subscribe expects { subscription, label? }');
                try {
                    bridge.subscribe(subscription, String(payload?.label ?? 'device'));
                    return ok(bridge.list());
                }
                catch (error) {
                    return fail(error instanceof Error ? error.message : 'subscribe failed');
                }
            }
            case PUSH_ENDPOINTS.unsubscribe: {
                const endpoint = payload?.endpoint;
                if (typeof endpoint !== 'string' || !endpoint)
                    return fail('push.unsubscribe expects { endpoint }');
                return ok({ removed: bridge.unsubscribe(endpoint), devices: bridge.list() });
            }
            case PUSH_ENDPOINTS.list:
                return ok(bridge.list());
            case PUSH_ENDPOINTS.test:
                return ok(await bridge.test());
            default:
                return fail(`unknown web-push endpoint: ${String(endpoint)}`);
        }
    };
}
// ---------------------------------------------------------------------------
// Pocket-style HTTP route (PRIMARY transport).
//
// Why: registering the channel through `connection.rpc.handle(..., {authority:
// 'loopback'})` mounts a connection-layer route that hard-rejects non-loopback
// request authorities — a phone hitting the dsh-pocket LAN IP or public tunnel
// domain gets 401 regardless of a perfectly valid browser session cookie.
// dsh-pocket solves this by mounting its OWN webServer prefix route that fences
// with `connection.requestRejection(req)` (cookie + Host/Origin checks only)
// and speaks the exact /api wire protocol. Mirror that architecture here.
// ---------------------------------------------------------------------------
/** endpoint segment characters (aligned with dsh-client-connection). */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
/** Bodies are small control JSON (subscriptions ≈ 1 KB); 1 MB is generous. */
const PUSH_RPC_BODY_MAX = 1024 * 1024;
/** Extract the endpoint from a `${channel}/<endpoint>` path, or undefined. */
function endpointFromPath(channel, pathname) {
    if (!pathname.startsWith(`${channel}/`))
        return undefined;
    const endpoint = pathname.slice(channel.length + 1);
    if (endpoint.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || !ENDPOINT_SEGMENT_PATTERN.test(seg))) {
        return undefined;
    }
    return endpoint;
}
/** server-response envelope (aligned with dsh-client-connection). */
function serverResponseJson(rpcId, result) {
    return JSON.stringify({ type: 'server-response', rpcId, result });
}
/** Legacy minimum fence when connection.requestRejection is unavailable. */
function isTrustedLoopbackRequest(req) {
    const host = req.headers?.host;
    if (!host)
        return false;
    if (!LOOPBACK_HOSTNAMES.has(host.split(':')[0]))
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
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
export function installPushHttpRoute(ctx, bridge, log = {}) {
    const webServer = ctx?.webServer;
    if (!webServer || typeof webServer.register !== 'function')
        return null;
    const connection = ctx?.connection;
    const handler = pushRpcHandler(bridge);
    const route = {
        kind: 'prefix',
        path: PUSH_RPC_CHANNEL,
        handler: async (req, res) => {
            // requestRejection MUST be called in method form so `this` binds to the
            // connection service (dsh-pocket issue #117 lost `this` here and every
            // request — including authed browsers — was rejected as 403).
            let rejection;
            if (typeof connection?.requestRejection === 'function') {
                try {
                    rejection = connection.requestRejection(req);
                }
                catch {
                    rejection = 403;
                }
            }
            else if (!isTrustedLoopbackRequest(req)) {
                rejection = 403;
            }
            if (rejection !== undefined) {
                res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' });
                res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
                return;
            }
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
            const endpoint = endpointFromPath(PUSH_RPC_CHANNEL, url.pathname);
            if (req.method !== 'POST' || endpoint === undefined) {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('not found');
                return;
            }
            const mediaType = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase();
            if (mediaType !== 'application/json') {
                res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('content type must be application/json');
                return;
            }
            const abort = new AbortController();
            res.on('close', () => { if (!res.writableEnded)
                abort.abort(); });
            const declared = req.headers['content-length'];
            if (declared !== undefined && Number(declared) > PUSH_RPC_BODY_MAX) {
                res.writeHead(413, { connection: 'close' });
                res.end();
                req.destroy();
                return;
            }
            const chunks = [];
            let received = 0;
            let tooLarge = false;
            for await (const chunk of req) {
                received += chunk.length;
                if (received > PUSH_RPC_BODY_MAX) {
                    tooLarge = true;
                    break;
                }
                chunks.push(chunk);
            }
            if (tooLarge) {
                res.writeHead(413, { connection: 'close' });
                res.end();
                req.destroy();
                return;
            }
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            }
            catch {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('body is not JSON');
                return;
            }
            const rpcId = body && typeof body.rpcId === 'string' ? body.rpcId : 'invalid-request';
            const method = body && typeof body.method === 'string' ? body.method : null;
            const envelopeHeaders = { 'content-type': 'application/json' };
            if (rpcId === 'invalid-request' || method === null) {
                res.writeHead(200, envelopeHeaders);
                res.end(serverResponseJson('invalid-request', { ok: false, error: { code: 'bad-request', message: 'invalid client-request message', details: { issues: [] } } }));
                return;
            }
            if (method !== endpoint) {
                res.writeHead(200, envelopeHeaders);
                res.end(serverResponseJson(rpcId, { ok: false, error: { code: 'bad-request', message: `method ${JSON.stringify(method)} does not match endpoint ${JSON.stringify(endpoint)}`, details: { issues: [] } } }));
                return;
            }
            try {
                const result = await handler(endpoint, body.payload, abort.signal);
                res.writeHead(200, envelopeHeaders);
                res.end(serverResponseJson(rpcId, result));
            }
            catch (error) {
                log.warn?.('[web-push] rpc %s failed: %s', endpoint, error instanceof Error ? error.message : String(error));
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                res.end(`handler failure: ${String(error)}`);
            }
        },
    };
    const registered = webServer.register(route);
    const cleanup = typeof registered === 'function'
        ? () => { try {
            registered();
        }
        catch { /* already disposed */ } }
        : registered && typeof registered.then === 'function'
            ? (() => { let done = false; return () => { if (done)
                return; done = true; void registered.then((d) => { try {
                d?.();
            }
            catch { /* already disposed */ } }).catch(() => { }); }; })()
            : () => { };
    log.warn?.('[web-push] HTTP RPC route mounted at %s (cookie fence, pocket-style)', PUSH_RPC_CHANNEL);
    return cleanup;
}
