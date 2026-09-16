# dsh-web-push

DeepSeek Harness 插件:让 DSH 通过 **Web Push 协议**直接给你的手机发**系统级推送通知** —— 锁屏、横幅、声音,和任何原生 app 一样。**不经过任何第三方 app**(不需要 Telegram/Bark/ntfy)。

## 工作原理

```
DSH host (session/event) ──> WebPushService ──> web-push (VAPID) ──> 浏览器推送服务 (FCM/autopush)
                                                                            │
手机浏览器 / 主屏 PWA  <── service worker showNotification <────────────────┘
```

- **Host 端**:监听 `session/event`(与 dsh-notify-plugin 同一批事件),用 VAPID 密钥把通知经 Web Push 协议发到每个已注册的浏览器订阅。
- **浏览器端**:设置页「手机推送」里一键注册 service worker + 订阅推送;订阅持久化在 `<DSH_HOME>/web-push/subscriptions.json`。
- **通知点击**:直达对应会话 —— 已打开的标签页原地切换(不刷新、不丢草稿),冷启动则打开 `/?session=<id>` 自动选中该会话。

## 支持的事件

| 事件 | 推送 |
|---|---|
| `conversationCompleted` | ✅ 对话完成(单行:图标 + 会话名,名字截 20 字) |
| `conversationPaused` | ⏸️ 对话暂停 / 等你输入 |
| `conversationFailed` | ❌ 对话失败 |
| `authorizationRequired` | 🔐 需要授权 |
| `confirmationRequired` | ❓ 需要回答(ask_user_question) |
| `todoProgress` | 📋 TODO 进度(仅进度变化时) |

子代理会话的结束/进度默认忽略(`mainAgentOnly`),避免噪音;需要人处理的提问/授权不受此过滤。

## 手机上的要求

| 平台 | 条件 |
|---|---|
| **Android**(Chrome/Edge/Firefox) | 通过 **HTTPS** 打开 DSH 即可,无需安装任何东西 |
| **iOS 16.4+**(Safari) | 必须先「添加到主屏幕」(Apple 硬性要求),再从主屏图标进入开启 |

**HTTPS 是硬性要求**(Web Push 规范)。局域网 `http://192.168.x.x` 无法订阅 —— 推荐配合 dsh-pocket 的**公网访问**(cloudflared 隧道,天然 HTTPS);要长期免重订阅,配命名隧道固定域名。

## 设置页入口

安装并重启 `dsh web` 后:**设置 → 手机推送**

1. 用手机通过 HTTPS 链接打开 DSH,进入「手机推送」
2. 点「开启本机推送」→ 浏览器弹授权 → 允许
3. 点「发送测试推送」→ 手机应立刻收到系统通知
4. 之后每个事件开关、设备管理都在这一页

推送按设备由服务端记忆,换域名不中断;但订阅按域名算,换域名后设置页按钮显示「未开启」属正常(页面会给出提示),在常用域名重新开启一次可让通知点击打开有效链接。失效订阅(404/410)会自动清理。

## 状态文件

全部在 `<DSH_HOME>/web-push/` 下:`vapid.json`(实例推送身份,勿删)、`subscriptions.json`、`config.json`。

## 开发

```bash
npm install
npm run build     # tsc(host lib/)+ esbuild(client/client.js)
npm run typecheck
```

客户端 bundle 是 DSH `window.__ModuleLoader__.load` 闭包工厂格式,`react` 由宿主模块表在运行时提供(不打包)。

## 卸载

```bash
dsh plugin --profile web remove dsh-web-push
rm -rf ~/.dsh/web-push   # 可选:清除 VAPID 与订阅
```
