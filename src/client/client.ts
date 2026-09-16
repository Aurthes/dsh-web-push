/**
 * dsh-web-push browser half: a top-level "手机推送" settings page (the same
 * settings.section entry style dsh-pocket / dsh-notify-plugin use).
 *
 * The page registers the plugin's service worker, asks the browser for
 * notification permission, subscribes to push with the host's VAPID public
 * key, and ships the subscription to the host over the /dsh-web-push RPC
 * channel. All strings are inlined zh/en dictionaries like dsh-notify.
 *
 * Built into the DSH window.__ModuleLoader__.load closure-factory bundle at
 * client/client.js. react is NOT bundled: the host module table provides it.
 */

import { createElement as h, useEffect, useMemo, useState } from 'react'

/** Must mirror src/host/rpc.ts. */
const PUSH_RPC_CHANNEL = '/dsh-web-push'

const ENDPOINTS = {
  configGet: 'push.config.get',
  configSet: 'push.config.set',
  vapidKey: 'push.vapid.key',
  subscribe: 'push.subscribe',
  unsubscribe: 'push.unsubscribe',
  list: 'push.subscriptions',
  test: 'push.test',
} as const

type RpcCall = (channel: string, endpoint: string, payload?: unknown, signal?: { aborted?: boolean }) => Promise<{ ok: boolean; value?: any; error?: { message?: string } }>

/** Dictionary namespace owned by this settings page. */
const NS = 'settings.webpush'

const zh = {
  nav: '手机推送',
  title: '手机推送（Web Push）',
  subtitle: '任务完成 / 需要回答 / 需要授权时,你的手机直接弹系统通知 —— 不经过任何第三方 app。',
  needHttps: '当前页面不是安全上下文(HTTP)。推送必须通过 HTTPS 打开 —— 请使用 dsh-pocket 的公网链接(或其它 HTTPS 入口)访问后再开启。',
  noSupport: '此浏览器不支持 Web Push(需要 Service Worker + PushManager)。Android 上请用 Chrome/Edge/Firefox。',
  permission: '通知权限',
  permGranted: '已授权',
  permDenied: '已被拒绝(请在浏览器站点设置里重置通知权限)',
  permDefault: '未申请',
  devices: '已订阅设备',
  noDevices: '还没有设备订阅。点「开启本机推送」把这台手机注册进来。',
  enable: '开启本机推送',
  enabling: '正在开启…',
  test: '发送测试推送',
  testing: '发送中…',
  removeThis: '移除本机订阅',
  enableFirst: '请先开启本机推送,再发测试。',
  saved: '设置已保存',
  pushSent: '测试推送已发送(检查手机通知)',
  pushFailed: '发送失败',
  lastDelivery: '最近送达',
  vapidMissing: '无法从 host 获取 VAPID 公钥(RPC 通道失败,请刷新页面或检查插件是否加载)',
  diag: '环境',
  stepSwRegister: '注册 service worker…',
  stepSwActive: '等待 service worker 激活…',
  stepPermAsk: '请求通知权限(留意手机系统弹窗,请点允许)…',
  stepSubscribing: '向推送服务订阅(手机需能连接 Google 服务)…',
  stepSaving: '保存订阅…',
  stepTimeout: '此步骤超时(75 秒)',
  enabled: '启用手机推送',
  events: '推送事件',
  evCompleted: '对话完成',
  evPaused: '对话暂停 / 等输入',
  evFailed: '对话失败',
  evAuth: '需要授权',
  evAsk: '需要回答(提问)',
  evTodo: 'TODO 进度',
  save: '保存设置',
  mainAgentOnly: '忽略子代理的结束/进度(仅主会话)',
  hint: '提示:首次开启时浏览器会弹通知授权,请选「允许」。Android 无需安装;若想图标化,可再「添加到主屏幕」。设备由服务端记忆,换域名不会丢;但订阅按域名算,换了访问域名后按钮显示「未开启」属正常,推送不受影响。',
  subscribedHere: '✅ 本机已订阅',
  notSubscribedHere: '本机未订阅',
  stillDelivering: 'ℹ️ 本浏览器(当前域名)未订阅,但服务器仍记录 {n} 台设备在收推送(经其他域名注册)——通知本身仍在送达。',
  perDomainNote: '但旧域名通知的点击跳转已失效(域名已死)。点页面底部的「🔔 恢复手机推送」(或上面「开启本机推送」)重新授权一次即可恢复——Chrome 按域名记通知权限,新域名必须重新点「允许」,这一步无法全自动。',
  restorePill: '🔔 恢复手机推送',
}

const en: Record<string, string> = {
  nav: 'Phone Push',
  title: 'Phone Push (Web Push)',
  subtitle: 'OS-level push on your phone when a task finishes, asks, or needs approval — no third-party app.',
  needHttps: 'This page is not a secure context (HTTP). Push requires HTTPS — open DSH via the dsh-pocket public link (or another HTTPS entry) first.',
  noSupport: 'This browser does not support Web Push (needs Service Worker + PushManager). Use Chrome/Edge/Firefox on Android.',
  permission: 'Permission',
  permGranted: 'granted',
  permDenied: 'denied (reset site notification permission in browser settings)',
  permDefault: 'not asked',
  devices: 'Subscribed devices',
  noDevices: 'No devices yet. Tap "Enable this device" to register this phone.',
  enable: 'Enable this device',
  enabling: 'Enabling…',
  test: 'Send test push',
  testing: 'Sending…',
  removeThis: 'Remove this device',
  enableFirst: 'Enable this device first, then test.',
  saved: 'Settings saved',
  pushSent: 'Test push sent (check your phone)',
  pushFailed: 'Send failed',
  lastDelivery: 'Last delivery',
  vapidMissing: 'Failed to load the VAPID public key from the host (RPC channel failed — refresh the page or check the plugin loaded)',
  diag: 'Environment',
  stepSwRegister: 'registering service worker…',
  stepSwActive: 'waiting for service worker activation…',
  stepPermAsk: 'requesting notification permission (watch for the system dialog, tap Allow)…',
  stepSubscribing: 'subscribing with the push service (phone must reach Google services)…',
  stepSaving: 'saving subscription…',
  stepTimeout: 'step timed out after 75s',
  enabled: 'Enable phone push',
  events: 'Events',
  evCompleted: 'Conversation completed',
  evPaused: 'Paused / waiting for you',
  evFailed: 'Conversation failed',
  evAuth: 'Approval required',
  evAsk: 'Question needs an answer',
  evTodo: 'TODO progress',
  save: 'Save',
  mainAgentOnly: 'Ignore subagent endings/progress (main sessions only)',
  hint: 'Tip: the browser asks for notification permission on first enable — choose Allow. Android needs no install; "Add to Home Screen" is optional. Devices are remembered server-side and survive domain changes; subscriptions are per-domain, so the button reading "off" after a domain change is cosmetic — pushes keep flowing.',
  subscribedHere: '✅ Subscribed on this device',
  notSubscribedHere: 'Not subscribed on this device',
  stillDelivering: 'ℹ️ This browser (current domain) is not subscribed, but the server still delivers to {n} device(s) registered via other domains — notifications are still arriving.',
  perDomainNote: 'However, clicks on those older notifications no longer jump anywhere (their domain is dead). Tap "🔔 Restore phone push" at the bottom of the page (or "Enable this device" above) to re-authorize — Chrome scopes notification permission per domain and the prompt needs a manual tap; it cannot be fully automated.',
  restorePill: '🔔 Restore phone push',
}

const DICTS: Record<string, Record<string, string>> = { zh, en }

const ENDPOINT_KEY = 'dsh-web-push.endpoint'
const REMOVED_KEY = 'dsh-web-push.removed'

/** Convert a base64url VAPID public key into the Uint8Array subscribe() needs. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

/** Browser capabilities this page depends on. */
function supportState(): { secure: boolean; supported: boolean; permission: string } {
  const secure = typeof window.isSecureContext === 'boolean' ? window.isSecureContext : location.protocol === 'https:'
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const permission = 'Notification' in window ? Notification.permission : 'unsupported'
  return { secure, supported, permission }
}

interface DeviceRow { endpoint: string; label: string; subscribedAt: number; lastSendAt?: number; lastSendOk?: boolean; lastError?: string }

/** Compact "x min ago" style formatter for delivery status. */
function agoText(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 1) return '<1min'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Props the settings.section renderer binds (inject face + locale copy). */
interface WebPushSettingsProps {
  rpcCall: RpcCall
  t: (key: string) => string
}

function WebPushSettings({ rpcCall, t }: WebPushSettingsProps) {
  const support = useMemo(supportState, [])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<any>(null)
  const [vapidKey, setVapidKey] = useState('')
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [ownEndpoint, setOwnEndpoint] = useState('')

  useEffect(() => {
    setOwnEndpoint(localStorage.getItem(ENDPOINT_KEY) ?? '')
    let alive = true
    void (async () => {
      try {
        const [cfg, key, list] = await Promise.all([
          rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.configGet),
          rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.vapidKey),
          rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.list),
        ])
        if (!alive) return
        setConfig(cfg.ok && cfg.value ? cfg.value : { enabled: true, events: {}, mainAgentOnly: true, titlePrefix: '' })
        setVapidKey(key.ok && key.value?.publicKey ? key.value.publicKey : '')
        setDevices(Array.isArray(list.value) ? list.value : [])
      } catch (error) {
        if (alive) setNote({ kind: 'err', text: `RPC failed: ${error instanceof Error ? error.message : String(error)}` })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [rpcCall])

  const subscribedHere = Boolean(ownEndpoint) && devices.some((d) => d.endpoint === ownEndpoint)

  async function refreshDevices(): Promise<void> {
    const list = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.list)
    if (list.ok) setDevices(Array.isArray(list.value) ? list.value : [])
  }

  async function enableDevice(): Promise<void> {
    // Precondition checks speak for themselves instead of a silently disabled
    // button — a no-op click is indistinguishable from a broken feature.
    if (!support.secure) { setNote({ kind: 'err', text: t('needHttps') }); return }
    if (!support.supported) { setNote({ kind: 'err', text: t('noSupport') }); return }
    if (!vapidKey) { setNote({ kind: 'err', text: t('vapidMissing') }); return }
    setBusy('enable'); setNote(null)

    // Step-level progress + watchdog: browser push APIs can hang SILENTLY for
    // minutes (unreachable push service, unnoticed permission dialog, a
    // service worker that never activates). Race each step against a timeout
    // so the page shows WHICH step stalled instead of an eternal "enabling…".
    const STEP_TIMEOUT_MS = 75000
    const withStep = <T,>(stepText: string, promise: Promise<T>): Promise<T> => {
      setNote({ kind: 'info', text: `⏳ ${stepText}` })
      return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`${t('stepTimeout')}: ${stepText}`)), STEP_TIMEOUT_MS)
        }),
      ])
    }

    try {
      // Permission FIRST, zero awaits deep in the click's transient
      // activation — Android Chrome silently denies a stale-gesture prompt.
      const permission = await withStep(t('stepPermAsk'), Notification.requestPermission())
      if (permission !== 'granted') throw new Error(t('permDenied'))
      await registerSubscription()
      setNote({ kind: 'ok', text: t('subscribedHere') })
    } catch (error) {
      setNote({ kind: 'err', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  /**
   * Register SW + subscribe + save to the host. Shared by the manual button
   * and the silent self-heal path: after a quick-tunnel restart the domain is
   * new, and merely OPENING the page must be enough to restore push — no
   * button, no permission prompt (permission is already granted).
   */
  async function registerSubscription(): Promise<void> {
    // Scope MUST be '/' (allowed by the sw.js route's Service-Worker-Allowed
    // header): `serviceWorker.ready` resolves only for a worker covering
    // the PAGE's scope — a /dsh-web-push/-scoped worker never activates
    // for a page at / and .ready waits forever by spec.
    const registration = await navigator.serviceWorker.register('/dsh-web-push/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
    const json = subscription.toJSON() as Record<string, unknown>
    const label = (navigator.userAgent.match(/Android[^;)]*|iPhone[^;)]*|iPad[^;)]*|Macintosh|Windows/)?.[0] ?? 'device')
    // Send the CURRENT page origin (captured live, never hardcoded): the
    // host uses it to supersede this device's subscriptions from older
    // quick-tunnel domains, whose notification clicks open dead URLs.
    const saved = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.subscribe, { subscription: json, label, origin: location.origin })
    if (!saved.ok) throw new Error(saved.error?.message ?? 'subscribe failed')
    localStorage.setItem(ENDPOINT_KEY, String(json.endpoint ?? ''))
    localStorage.removeItem(REMOVED_KEY)
    setOwnEndpoint(String(json.endpoint ?? ''))
    await refreshDevices()
  }

  async function removeDevice(): Promise<void> {
    if (!ownEndpoint) return
    setBusy('remove'); setNote(null)
    try {
      await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.unsubscribe, { endpoint: ownEndpoint })
      try { const reg = await navigator.serviceWorker.getRegistration(); await reg?.pushManager.getSubscription()?.then((s) => s?.unsubscribe()) } catch { /* best effort */ }
      localStorage.removeItem(ENDPOINT_KEY)
      // An explicit removal is the ONLY thing that opts this origin out of
      // the silent self-heal below — otherwise re-subscribe after restarts.
      localStorage.setItem(REMOVED_KEY, '1')
      setOwnEndpoint('')
      await refreshDevices()
    } finally {
      setBusy('')
    }
  }

  async function sendTest(): Promise<void> {
    if (!subscribedHere) { setNote({ kind: 'err', text: t('enableFirst') }); return }
    setBusy('test'); setNote(null)
    try {
      const result = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.test)
      if (result.ok && result.value?.sent > 0) setNote({ kind: 'ok', text: t('pushSent') })
      else setNote({ kind: 'err', text: `${t('pushFailed')}: ${(result.value?.errors ?? []).join('; ') || 'no device reached'}` })
      await refreshDevices()
    } catch (error) {
      setNote({ kind: 'err', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  async function saveConfig(next: any): Promise<void> {
    setConfig(next)
    const result = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.configSet, next)
    if (result.ok) setNote({ kind: 'ok', text: t('saved') })
    else setNote({ kind: 'err', text: result.error?.message ?? 'save failed' })
  }

  const styles: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720, fontSize: 13, lineHeight: 1.5 },
    card: { border: '1px solid var(--dsh-border, #2a2f3a)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
    warn: { border: '1px solid #b5890055', background: '#b5890015', borderRadius: 10, padding: '10px 14px', color: '#d7a94b' },
    info: { border: '1px solid #4d6bfe55', background: '#4d6bfe14', borderRadius: 10, padding: '10px 14px' },
    row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    button: { borderRadius: 8, border: '1px solid var(--dsh-border, #2a2f3a)', padding: '6px 14px', cursor: 'pointer', background: 'var(--dsh-accent, #4d6bfe)', color: '#fff', fontWeight: 600 },
    buttonGhost: { borderRadius: 8, border: '1px solid var(--dsh-border, #2a2f3a)', padding: '6px 14px', cursor: 'pointer', background: 'transparent', color: 'inherit' },
    muted: { opacity: 0.7 },
    ok: { color: '#4caf7d' },
    err: { color: '#e06c60' },
    label: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
    device: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: '1px dashed var(--dsh-border, #2a2f3a55)' },
    h: { margin: 0, fontSize: 15, fontWeight: 700 },
  }

  if (loading) return h('div', { style: styles.page }, t('title'), h('div', { style: styles.muted }, '…'))

  const evKey = (k: string) => Boolean(config?.events?.[k])

  return h('div', { style: styles.page },
    h('h3', { style: styles.h }, t('title')),
    h('div', { style: styles.muted }, t('subtitle')),

    !support.secure && h('div', { style: styles.warn }, `⚠️ ${t('needHttps')}`),
    !support.supported && h('div', { style: styles.warn }, `⚠️ ${t('noSupport')}`),
    note && h('div', { style: note.kind === 'ok' ? styles.ok : note.kind === 'info' ? styles.muted : styles.err }, note.text),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('button', {
          style: styles.button,
          disabled: busy !== '',
          onClick: () => { void enableDevice() },
        }, busy === 'enable' ? t('enabling') : subscribedHere ? t('subscribedHere') : t('enable')),
        h('button', { style: styles.buttonGhost, disabled: busy !== '', onClick: () => { void sendTest() } },
          busy === 'test' ? t('testing') : t('test')),
        subscribedHere && h('button', { style: styles.buttonGhost, disabled: busy !== '', onClick: () => { void removeDevice() } }, t('removeThis')),
      ),
      !subscribedHere && devices.length > 0 && h('div', { style: styles.info },
        t('stillDelivering').replace('{n}', String(devices.length)),
        h('div', { style: styles.muted }, t('perDomainNote')),
      ),
      h('div', { style: styles.muted }, `${t('permission')}: ${support.permission === 'granted' ? t('permGranted') : support.permission === 'denied' ? t('permDenied') : t('permDefault')}`),
      h('div', { style: styles.muted },
        `${t('diag')}: HTTPS ${support.secure ? '✓' : '✗'} · Web Push ${support.supported ? '✓' : '✗'} · VAPID ${vapidKey ? '✓' : '✗'} · ${t('permission')} ${support.permission}`),
    ),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('label', { style: styles.label },
          h('input', {
            type: 'checkbox',
            checked: config?.enabled !== false,
            onChange: (e: any) => { void saveConfig({ ...config, enabled: e.target.checked }) },
          }),
          t('enabled'),
        ),
        h('label', { style: styles.label },
          h('input', {
            type: 'checkbox',
            checked: config?.mainAgentOnly !== false,
            onChange: (e: any) => { void saveConfig({ ...config, mainAgentOnly: e.target.checked }) },
          }),
          t('mainAgentOnly'),
        ),
      ),
      h('div', { style: { fontWeight: 600 } }, t('events')),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 } },
        ...([
          ['conversationCompleted', 'evCompleted'],
          ['conversationPaused', 'evPaused'],
          ['conversationFailed', 'evFailed'],
          ['authorizationRequired', 'evAuth'],
          ['confirmationRequired', 'evAsk'],
          ['todoProgress', 'evTodo'],
        ] as Array<[string, string]>).map(([key, label]) =>
          h('label', { key, style: styles.label },
            h('input', {
              type: 'checkbox',
              checked: evKey(key),
              onChange: (e: any) => { void saveConfig({ ...config, events: { ...config.events, [key]: e.target.checked } }) },
            }),
            t(label),
          ),
        ),
      ),
    ),

    h('div', { style: styles.card },
      h('div', { style: { fontWeight: 600 } }, t('devices')),
      devices.length === 0 && h('div', { style: styles.muted }, t('noDevices')),
      ...devices.map((d) => h('div', { key: d.endpoint, style: { padding: '4px 0', borderBottom: '1px dashed var(--dsh-border, #2a2f3a55)' } },
        h('div', { style: styles.device },
          h('span', {}, `${d.label || 'device'} · ${new Date(d.subscribedAt).toLocaleString()}`),
          h('span', { style: styles.muted }, d.endpoint === ownEndpoint ? t('subscribedHere') : `${d.endpoint.slice(-18)}`),
        ),
        d.lastSendAt !== undefined && h('div', { style: { fontSize: 12, ...(d.lastSendOk ? styles.ok : styles.err) } },
          d.lastSendOk
            ? `✓ ${t('lastDelivery')} ${agoText(d.lastSendAt)}前`
            : `✗ ${t('lastDelivery')} ${agoText(d.lastSendAt)}前: ${d.lastError ?? 'failed'}`),
      )),
    ),

    h('div', { style: styles.muted }, t('hint')),
  )
}

export const name = 'dsh-web-push'

/** Required services this page injects (host-provided cordis services). */
export const inject = ['slots', 'connection', 'locale']

/** Mount the web-push settings page into the Settings sidebar. */
export function apply(ctx: any): void {
  // The browser-side connection gates rpc.call on its isLoopback flag, which
  // is false when the page is served from a non-loopback origin (dsh-pocket
  // LAN IP or the public tunnel domain) — the exact case where this settings
  // page matters. dsh-pocket's client forces the same flag before its calls;
  // mirror that so the /dsh-web-push channel is callable from the phone.
  if (ctx?.connection) {
    try {
      Object.defineProperty(ctx.connection, 'isLoopback', { value: true, writable: true, configurable: true })
    } catch {
      try { ctx.connection.isLoopback = true } catch { /* frozen — desktop loopback already true */ }
    }
  }

  ctx.effect(() => ctx.locale.register(NS, DICTS), 'web-push: settings dictionaries')
  const t = ctx.locale.bind(NS)

  // ---------------------------------------------------------------- deep link
  // Push notifications carry ?session=<id>: a cold open lands on the URL, a
  // live tab gets a 'dsh-web-push:open' postMessage from the service worker
  // (no reload). Both funnel into uiWorkspace.openSession — the exact call
  // the sidebar makes — so a notification click lands on its session.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['uiWorkspace'], (wctx: any) => {
      const ws = wctx.uiWorkspace
      const openTarget = (sessionId: string): void => {
        // Cold start: the sessions list may still be hydrating. Wait for the
        // id to appear, or for the list to settle without it, before
        // switching; never fight the user's own navigation after ~10s.
        let attempts = 0
        const attempt = (): void => {
          const snap = ws?.sessions?.list?.getSnapshot?.()
          const known = !!snap && (snap.byId?.[sessionId] !== undefined || snap.ids?.includes(sessionId))
          if (known) {
            try { ws.openSession(sessionId) } catch { /* UI mid-teardown */ }
            return
          }
          if (snap?.phase === 'ready') return // settled without the id — stale link, stay put
          if (++attempts > 40) return
          setTimeout(attempt, 250)
        }
        attempt()
      }

      const fromUrl = new URLSearchParams(location.search).get('session')
      if (fromUrl) {
        history.replaceState(null, '', location.pathname) // plain refreshes must not re-switch
        openTarget(fromUrl)
      }

      navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string; session?: string } | null
        if (data?.type === 'dsh-web-push:open' && data.session) openTarget(data.session)
      })
    })
  }

  // Talk to the host over a direct same-origin fetch on the channel route —
  // the same /api wire protocol the shell uses: POST {channel}/{endpoint}
  // with the { rpcId, method, payload } envelope, response
  // { type: 'server-response', rpcId, result }. The browser's session cookie
  // rides along automatically, so the host-side requestRejection fence passes
  // exactly as it does for the app's own API calls — including through the
  // dsh-pocket proxy (LAN and public tunnel origins), where the browser-side
  // connection.rpc.call gate has proven unreliable for plugin channels.
  // ctx.connection.rpc.call is kept as a fallback for exotic deployments.
  const fetchRpc: RpcCall = async (channel, endpoint, payload, signal) => {
    const res = await fetch(`${channel}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rpcId: `wpc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, method: endpoint, payload: payload ?? {} }),
      credentials: 'same-origin',
      signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 140) || '(empty)'}`)
    let json: any
    try { json = JSON.parse(text) } catch { throw new Error(`non-JSON response: ${text.slice(0, 140)}`) }
    if (json?.type === 'server-response') {
      const result = json.result
      return {
        ok: Boolean(result?.ok),
        value: result && result.ok ? result.value : undefined,
        error: result && !result.ok ? result.error : undefined,
      }
    }
    if (json && typeof json.ok === 'boolean') {
      return { ok: json.ok, value: json.value, error: json.error }
    }
    throw new Error(`unexpected envelope: ${text.slice(0, 140)}`)
  }

  const rpcCall: RpcCall = async (channel, endpoint, payload, signal) => {
    try {
      return await fetchRpc(channel, endpoint, payload, signal)
    } catch (error) {
      // Fall back to the shell's connection transport when the HTTP route is
      // absent (e.g. a future dsh that changes the rpc mounting scheme).
      try {
        const result: any = await ctx.connection.rpc.call(channel, endpoint, payload, signal)
        return {
          ok: Boolean(result?.ok),
          value: result && result.ok ? (result as { value?: unknown }).value : undefined,
          error: result && !result.ok ? (result as { error?: { message?: string } }).error : undefined,
        }
      } catch {
        throw error
      }
    }
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'web-push',
    order: 61,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ rpcCall }),
  }, WebPushSettings))

  // ------------------------------------------------------------- self-heal
  // Runs on EVERY page load (not just the settings page), in two tiers:
  //   permission granted → silently re-subscribe (no prompt, no button);
  //   permission default  → show a one-tap restore pill at the page bottom.
  // Chrome scopes notification permission per domain and the prompt needs a
  // user gesture (a gesture-less requestPermission is auto-denied on Android
  // Chrome and can latch), so for every fresh quick-tunnel domain the pill
  // tap + Allow is the least manual flow that works. The host supersedes this
  // device's subscriptions from older dead domains, so after the tap
  // everything converges to exactly one working subscription per device.
  const ensureSubscription = async (): Promise<boolean> => {
    try {
      const [cfg, key] = await Promise.all([
        rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.configGet),
        rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.vapidKey),
      ])
      if (!cfg.ok || cfg.value?.enabled === false) return false
      if (!key.ok || !key.value?.publicKey) return false
      const registration = await navigator.serviceWorker.register('/dsh-web-push/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      // Reuse a live subscription on this origin if the browser kept one;
      // subscribe() throws when one already exists.
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.value.publicKey),
      })
      const json = subscription.toJSON() as Record<string, unknown>
      const label = (navigator.userAgent.match(/Android[^;)]*|iPhone[^;)]*|iPad[^;)]*|Macintosh|Windows/)?.[0] ?? 'device')
      const saved = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.subscribe, { subscription: json, label, origin: location.origin })
      if (!saved.ok) return false
      localStorage.setItem(ENDPOINT_KEY, String(json.endpoint ?? ''))
      localStorage.removeItem(REMOVED_KEY)
      return true
    } catch {
      return false
    }
  }

  const showRestorePill = (): void => {
    if (document.getElementById('dsh-web-push-restore')) return
    const pill = document.createElement('div')
    pill.id = 'dsh-web-push-restore'
    pill.style.cssText = [
      'position:fixed', 'z-index:2147483000',
      `bottom:${window.innerWidth < 700 ? '96px' : '24px'}`,
      'left:50%', 'transform:translateX(-50%)',
      'display:flex', 'align-items:center', 'gap:12px',
      'background:#4d6bfe', 'color:#fff', 'border-radius:999px',
      'padding:10px 18px', 'font-size:14px', 'font-weight:600',
      'font-family:inherit', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    ].join(';')
    const text = document.createElement('span')
    text.textContent = t('restorePill')
    const close = document.createElement('span')
    close.textContent = '✕'
    close.style.cssText = 'opacity:.7;font-weight:400'
    pill.append(text, close)
    pill.onclick = async (ev) => {
      if (ev.target === close) {
        // Explicit dismissal opts this origin out of both the pill and the
        // silent heal until the user re-enables from the settings page.
        localStorage.setItem(REMOVED_KEY, '1')
        pill.remove()
        return
      }
      pill.style.opacity = '0.6'
      // This tap is the user gesture the permission prompt requires.
      const permission = await Notification.requestPermission()
      if (permission === 'granted' && await ensureSubscription()) {
        pill.remove()
        return
      }
      pill.style.opacity = '1' // denied or failed — keep it visible this visit
    }
    document.body.appendChild(pill)
  }

  void (async () => {
    try {
      const support = supportState()
      if (!support.secure || !support.supported) return
      if (localStorage.getItem(REMOVED_KEY)) return // explicit opt-out
      const permission = Notification.permission
      if (permission === 'denied') return // needs a manual site-settings reset
      if (permission === 'granted') {
        const own = localStorage.getItem(ENDPOINT_KEY) ?? ''
        if (own) {
          const list = await rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.list)
          if (list.ok && Array.isArray(list.value) && list.value.some((d: any) => d.endpoint === own)) return // already subscribed on this origin
        }
        await ensureSubscription()
        return
      }
      // Fresh domain (permission 'default'): only worth nudging when this DSH
      // actually has push consumers registered — otherwise stay invisible.
      const [cfg, list] = await Promise.all([
        rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.configGet),
        rpcCall(PUSH_RPC_CHANNEL, ENDPOINTS.list),
      ])
      if (!cfg.ok || cfg.value?.enabled === false) return
      if (!Array.isArray(list.value) || list.value.length === 0) return
      showRestorePill()
    } catch {
      // Silent best effort — the settings page surfaces real errors when used.
    }
  })()
}
