/**
 * Persistence for dsh-web-push: VAPID keys, browser push subscriptions, and
 * the user's config edits. Files live under <DSH_HOME>/web-push/ and are the
 * plugin's private state — nothing else reads them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const DEFAULT_CONFIG = {
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
    telegram: { enabled: false, botToken: '', chatId: '' },
};
/** Resolve DSH_HOME, falling back to ~/.dsh (same rule as dsh-notify-plugin). */
export function dshHome() {
    const fromEnv = process.env.DSH_HOME;
    return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh');
}
function stateDir() {
    return join(dshHome(), 'web-push');
}
function stateFile(name) {
    return join(stateDir(), name);
}
function readJson(file) {
    if (!existsSync(file))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        return null;
    }
}
function writeJson(file, value) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
/** Load the persisted VAPID keypair, or null before the first generate. */
export function loadVapid() {
    return readJson(stateFile('vapid.json'));
}
export function saveVapid(keys) {
    writeJson(stateFile('vapid.json'), keys);
}
/** Load every stored subscription. */
export function loadSubscriptions() {
    const stored = readJson(stateFile('subscriptions.json'));
    return Array.isArray(stored?.subscriptions) ? stored.subscriptions : [];
}
export function saveSubscriptions(subs) {
    writeJson(stateFile('subscriptions.json'), { subscriptions: subs });
}
/** Load the persisted config (partial) for merging over defaults. */
export function loadConfig() {
    return readJson(stateFile('config.json'));
}
export function saveConfig(config) {
    writeJson(stateFile('config.json'), config);
}
