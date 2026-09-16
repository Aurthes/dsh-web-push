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
import { Context } from '@deepseek-ai/cordis';
import { WebPushService } from './service.js';
/** Host services this plugin depends on (same pair dsh-pocket/notify use). */
export declare const inject: string[];
export default function webPushPlugin(ctx: Context, config?: Parameters<WebPushService['getConfig'] extends never ? never : never> | any): WebPushService;
export { WebPushService } from './service.js';
export { PUSH_RPC_CHANNEL, PUSH_ENDPOINTS } from './rpc.js';
export * from './store.js';
export * from './assets.js';
