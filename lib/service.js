/**
 * WebPushService — the host-side core of dsh-web-push.
 *
 * Listens to the same `session/event` stream the dsh-notify-plugin uses and
 * fans important moments out to every registered browser push subscription via
 * the Web Push protocol (VAPID). Delivery is OS-level on the phone: lock
 * screen, banner, sound — no third-party app involved.
 */
import { Service } from '@deepseek-ai/cordis';
import webpush from 'web-push';
import { DEFAULT_CONFIG, loadConfig, loadSubscriptions, loadVapid, saveConfig, saveSubscriptions, saveVapid, } from './store.js';
export class WebPushService extends Service {
    config;
    vapid;
    subscriptions;
    listenersRegistered = false;
    /** Last pushed TODO-list signature per session (progress-only pushes). */
    lastTodoSignature = new Map();
    constructor(ctx, config) {
        super(ctx, 'webPush');
        this.config = this.mergeConfig(config || {});
        // Reuse the persisted VAPID identity, or create one on first boot. The
        // public key reaches the browser (subscribe) while the private key signs
        // every outgoing push; rotating them invalidates existing subscriptions.
        this.vapid = loadVapid() ?? this.generateVapid();
        this.subscriptions = loadSubscriptions();
        if (this.config.enabled)
            this.registerEventListeners();
        // `send` on ctx is owned by dsh-notify-plugin; expose ours prefixed.
        ctx.mixin('webPush', { send: 'webPushSend' });
    }
    /** Effective runtime config (persisted edits already merged by the entry). */
    getConfig() {
        return { ...this.config, events: { ...this.config.events } };
    }
    /** Apply a partial config at runtime and persist it. */
    updateConfig(partial) {
        const next = {
            enabled: typeof partial.enabled === 'boolean' ? partial.enabled : this.config.enabled,
            mainAgentOnly: typeof partial.mainAgentOnly === 'boolean' ? partial.mainAgentOnly : this.config.mainAgentOnly,
            titlePrefix: typeof partial.titlePrefix === 'string' ? partial.titlePrefix : this.config.titlePrefix,
            proxyUrl: typeof partial.proxyUrl === 'string' ? partial.proxyUrl : this.config.proxyUrl,
            events: { ...this.config.events, ...(partial.events ?? {}) },
        };
        this.config = next;
        saveConfig(next);
        if (next.enabled)
            this.registerEventListeners();
        return this.getConfig();
    }
    /** The VAPID public key the browser needs to subscribe. */
    getPublicKey() {
        return this.vapid.publicKey;
    }
    /** Every stored subscription (without per-device secrets exposure beyond keys). */
    listSubscriptions() {
        return this.subscriptions.map(({ endpoint, label, subscribedAt, origin }) => ({ endpoint, label, subscribedAt, origin }));
    }
    /**
     * Add or refresh one subscription (keyed by endpoint). A re-register from
     * the SAME device label through a DIFFERENT origin (quick-tunnel restart)
     * supersedes that device's older subscriptions: the old-origin worker
     * still receives pushes but its clicks open the dead domain, and two
     * same-tag notifications race for the screen. Keep only the newest.
     */
    addSubscription(subscription, label, origin) {
        const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
        if (!endpoint)
            throw new Error('subscription.endpoint is required');
        const keys = subscription.keys;
        if (!keys || typeof keys !== 'object')
            throw new Error('subscription.keys (p256dh/auth) is required');
        this.subscriptions = [
            ...this.subscriptions.filter((s) => s.endpoint !== endpoint && !(s.label === label && s.origin !== origin)),
            {
                endpoint,
                label: String(label || '').slice(0, 80) || 'device',
                subscribedAt: Date.now(),
                origin: origin || undefined,
                subscription,
            },
        ];
        saveSubscriptions(this.subscriptions);
    }
    /** Remove one subscription by endpoint (user action or stale cleanup). */
    removeSubscription(endpoint) {
        const before = this.subscriptions.length;
        this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
        if (this.subscriptions.length !== before)
            saveSubscriptions(this.subscriptions);
        return this.subscriptions.length !== before;
    }
    /**
     * Send one notification to every registered device. Best-effort per device:
     * one failing endpoint never blocks the others, and 404/410 endpoints (the
     * push service forgot the subscription) are dropped automatically.
     */
    async send(payload) {
        let sent = 0;
        let removed = 0;
        const errors = [];
        if (!this.config.enabled)
            return { sent, removed, errors };
        if (this.subscriptions.length === 0)
            return { sent, removed, errors };
        const body = JSON.stringify({
            title: `${this.config.titlePrefix}${payload.title}`,
            body: payload.body ?? '',
            tag: payload.tag,
            url: payload.url ?? '/',
            session: payload.session,
            icon: '/dsh-web-push/icon.svg',
        });
        const stale = [];
        /** Per-endpoint outcome of this batch, folded into stored state below. */
        const outcomes = new Map();
        const sendOptions = {
            vapidDetails: { subject: 'mailto:dsh-web-push@localhost', publicKey: this.vapid.publicKey, privateKey: this.vapid.privateKey },
            timeout: 10000,
        };
        const proxy = this.resolveProxy();
        if (proxy)
            sendOptions.proxy = proxy;
        await Promise.all(this.subscriptions.map(async (stored) => {
            try {
                await webpush.sendNotification(stored.subscription, body, sendOptions);
                outcomes.set(stored.endpoint, { ok: true });
                sent++;
            }
            catch (error) {
                const err = error;
                if (err.statusCode === 404 || err.statusCode === 410) {
                    stale.push(stored.endpoint);
                    removed++;
                }
                else {
                    outcomes.set(stored.endpoint, { ok: false, error: `${err.statusCode ?? 'net'} ${err.message ?? 'send failed'}`.slice(0, 160) });
                    errors.push(`${stored.endpoint.slice(-24)}: ${err.statusCode ?? ''} ${err.message ?? 'send failed'}`);
                    this.ctx.logger.warn('[web-push] send failed:', err.statusCode ?? '', err.message ?? err);
                }
            }
        }));
        // Fold delivery outcomes into per-device state so the settings page can
        // show "用着用着不行了" symptoms (last send time + error) per device.
        if (outcomes.size > 0 || stale.length > 0) {
            const now = Date.now();
            this.subscriptions = this.subscriptions
                .filter((s) => !stale.includes(s.endpoint))
                .map((s) => {
                const outcome = outcomes.get(s.endpoint);
                if (!outcome)
                    return s;
                return { ...s, lastSendAt: now, lastSendOk: outcome.ok, lastError: outcome.ok ? undefined : outcome.error };
            });
            saveSubscriptions(this.subscriptions);
        }
        return { sent, removed, errors };
    }
    /** Fire a test push from the settings page. */
    async sendTest() {
        return this.send({ title: '🔔 DSH 推送测试', body: `如果你在手机上看到这条通知,web push 就通了(${new Date().toLocaleTimeString()})`, tag: 'dsh-test' });
    }
    async dispose() {
        this.lastTodoSignature.clear();
    }
    // ------------------------------------------------------------------ internals
    mergeConfig(partial) {
        // Precedence: persisted user edits (settings page) WIN over the patch
        // config, patch wins over defaults — same semantics as dsh-notify-plugin.
        // Otherwise every `dsh web` restart would silently revert settings-page
        // edits back to the bundle defaults.
        const persisted = loadConfig();
        const merged = {
            enabled: persisted?.enabled ?? partial.enabled ?? DEFAULT_CONFIG.enabled,
            mainAgentOnly: persisted?.mainAgentOnly ?? partial.mainAgentOnly ?? DEFAULT_CONFIG.mainAgentOnly,
            titlePrefix: persisted?.titlePrefix ?? partial.titlePrefix ?? DEFAULT_CONFIG.titlePrefix,
            proxyUrl: persisted?.proxyUrl ?? partial.proxyUrl ?? DEFAULT_CONFIG.proxyUrl,
            events: { ...DEFAULT_CONFIG.events, ...(partial.events ?? {}), ...(persisted?.events ?? {}) },
        };
        return merged;
    }
    generateVapid() {
        const keys = webpush.generateVAPIDKeys();
        const vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
        saveVapid(vapid);
        this.ctx.logger.info('[web-push] generated new VAPID keypair');
        return vapid;
    }
    /**
     * The outbound proxy web-push should use to reach the browser push service:
     * explicit config > env (https_proxy / HTTPS_PROXY). web-push's raw node
     * https ignores both the system proxy and NODE_USE_ENV_PROXY, so on networks
     * where fcm.googleapis.com is only reachable through a local proxy (e.g.
     * Clash on 127.0.0.1:7890), direct sends time out with "Socket timeout".
     */
    resolveProxy() {
        const explicit = (this.config.proxyUrl ?? '').trim();
        if (explicit)
            return explicit;
        const env = (process.env.https_proxy ?? process.env.HTTPS_PROXY ?? '').trim();
        return env || undefined;
    }
    registerEventListeners() {
        if (this.listenersRegistered)
            return;
        this.listenersRegistered = true;
        this.ctx.on('session/event', async (session, event) => {
            try {
                await this.handleSessionEvent(session, event);
            }
            catch (error) {
                this.ctx.logger.warn('[web-push] event handling failed:', error);
            }
        });
        this.ctx.logger.info('[web-push] session/event listener registered');
    }
    async handleSessionEvent(session, event) {
        if (!event?.type)
            return;
        const suppressSubagent = this.config.mainAgentOnly && this.isSubagentSession(session);
        if (event.type === 'tool/call') {
            const name = event.data?.name || '';
            if (name === 'ask_user_question') {
                await this.handleUserQuestion(session, event);
            }
            if (name === 'todo_write' && !suppressSubagent) {
                await this.handleTodos(session, this.parseToolArguments(event.data?.arguments)?.todos);
            }
            return;
        }
        if (event.type === 'todo/write') {
            if (suppressSubagent)
                return;
            await this.handleTodos(session, event.data?.todos);
            return;
        }
        if (event.type === 'approval/asked') {
            await this.handleApprovalRequest(session, event);
            return;
        }
        if (event.type === 'turn/end') {
            if (suppressSubagent)
                return;
            await this.handleTurnEnd(session, event);
        }
    }
    /**
     * Turn-end push = one line, minimum glyphs: "<icon> <name>". The icon IS
     * the status (✅ completed / ❌ failed / ⏸️ paused), so no status word is
     * spent; the name is hard-capped so auto-generated titles from long
     * prompts can't bloat it. Body stays empty. Clicking deep-links to the
     * session.
     */
    async handleTurnEnd(session, event) {
        if (!this.config.events.conversationCompleted && !this.config.events.conversationFailed && !this.config.events.conversationPaused)
            return;
        const reason = event.data?.reason?.kind || 'unknown';
        const name = this.sessionShortName(session);
        const tag = `turn-${session?.id}`;
        const link = this.deepLink(session);
        if (reason === 'completed' || reason === 'max-tokens') {
            if (!this.config.events.conversationCompleted)
                return;
            await this.send({ title: `✅ ${name}`, tag, ...link });
        }
        else if (reason === 'error') {
            if (!this.config.events.conversationFailed)
                return;
            await this.send({ title: `❌ ${name}`, tag, ...link });
        }
        else {
            if (!this.config.events.conversationPaused)
                return;
            await this.send({ title: `⏸️ ${name}`, tag, ...link });
        }
    }
    /** Click-target fields shared by every session-scoped push. */
    deepLink(session) {
        const id = typeof session?.id === 'string' ? session.id : '';
        return id ? { url: `/?session=${encodeURIComponent(id)}`, session: id } : { url: '/' };
    }
    async handleUserQuestion(session, event) {
        if (!this.config.events.confirmationRequired)
            return;
        const args = this.parseToolArguments(event.data?.arguments);
        const questions = Array.isArray(args?.questions) ? args.questions : [];
        const first = questions[0];
        const questionText = first?.question || '请回答以下问题';
        const header = first?.header;
        const options = (first?.options || []).map((o) => o?.label).filter(Boolean).join(' / ');
        const lines = [];
        if (header)
            lines.push(`📌 ${header}`);
        lines.push(`❓ ${questionText}`);
        if (options)
            lines.push(`🔘 ${options}`);
        const workspace = this.workspaceOf(session);
        await this.send({
            title: workspace ? `❓ [${workspace}] 需要回答` : '❓ 需要回答',
            body: lines.join('\n'),
            tag: `question-${session?.id}`,
            ...this.deepLink(session),
        });
    }
    async handleApprovalRequest(session, event) {
        if (!this.config.events.authorizationRequired)
            return;
        const toolName = event.data?.toolName || '未知操作';
        const reason = event.data?.reason || '需要您的授权才能继续';
        const workspace = this.workspaceOf(session);
        const lines = [`🔐 操作: ${toolName}`];
        if (reason)
            lines.push(`📝 ${reason}`);
        await this.send({
            title: workspace ? `🔐 [${workspace}] 需要授权` : '🔐 需要授权',
            body: lines.join('\n'),
            tag: `approval-${session?.id}`,
            ...this.deepLink(session),
        });
    }
    async handleTodos(session, todos) {
        if (!this.config.events.todoProgress)
            return;
        if (!Array.isArray(todos) || todos.length === 0)
            return;
        const items = todos;
        const done = items.filter((t) => t?.status === 'completed').length;
        const signature = JSON.stringify(items.map((t) => `${t?.status ?? ''}:${t?.content ?? ''}`));
        if (this.lastTodoSignature.get(session?.id) === signature)
            return;
        this.lastTodoSignature.set(session?.id, signature);
        const icons = { completed: '✅', in_progress: '🔄' };
        const lines = [`📊 进度: ${done}/${items.length} 已完成`];
        for (const item of items.slice(0, 10)) {
            lines.push(`${icons[item?.status ?? ''] ?? '⬜'} ${item?.content ?? ''}`);
        }
        if (items.length > 10)
            lines.push(`… 共 ${items.length} 项`);
        const workspace = this.workspaceOf(session);
        await this.send({
            title: workspace ? `📋 [${workspace}] TODO 进度 ${done}/${items.length}` : `📋 TODO 进度 ${done}/${items.length}`,
            body: lines.join('\n'),
            tag: `todo-${session?.id}`,
            ...this.deepLink(session),
        });
    }
    // ------------------------------------------------------------------ summary helpers
    // (Adapted from dsh-notify-plugin's proven extractors, slimmed for push-sized payloads.)
    workspaceOf(session) {
        const cwd = session?.header?.cwd;
        return cwd ? cwd.split('/').filter(Boolean).pop() || cwd : undefined;
    }
    isSubagentSession(session) {
        const header = session?.header;
        if (!header)
            return false;
        if (header.origin === 'subagent')
            return true;
        return typeof header.delegationDepth === 'number' && header.delegationDepth > 0;
    }
    parseToolArguments(raw) {
        if (typeof raw !== 'string' || !raw)
            return {};
        try {
            return JSON.parse(raw);
        }
        catch {
            return {};
        }
    }
    /** One-line session label, hard-capped: session title > workspace > id. */
    sessionShortName(session) {
        const CAP = 20;
        let title = '';
        for (const e of Array.isArray(session?.log) ? session.log : []) {
            if (e?.type === 'session/title' && e.data?.title)
                title = e.data.title;
        }
        if (title)
            return this.oneLine(title, CAP);
        const ws = this.workspaceOf(session);
        if (ws)
            return this.oneLine(ws, CAP);
        const id = typeof session?.id === 'string' ? session.id : '';
        return id ? id.slice(0, 8) : 'session';
    }
    /** Collapse whitespace and cap length — push payloads stay one line. */
    oneLine(text, max) {
        const compact = String(text ?? '').replace(/\s+/g, ' ').trim();
        return compact.length <= max ? compact : `${compact.slice(0, max).trimEnd()}…`;
    }
    extractErrorMessage(error) {
        if (typeof error === 'string')
            return error;
        if (error?.message)
            return String(error.message);
        if (error?.code)
            return String(error.code);
        try {
            return JSON.stringify(error);
        }
        catch {
            return '未知错误';
        }
    }
}
export default WebPushService;
