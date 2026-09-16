/**
 * Static web assets served by the plugin over webServer routes:
 *
 *   /dsh-web-push/sw.js                  — the service worker (push + click)
 *   /dsh-web-push/manifest.webmanifest   — minimal PWA manifest (A2HS / icons)
 *   /dsh-web-push/icon.svg               — notification + home-screen icon
 *
 * The service worker scope is /dsh-web-push/ (its own directory), which is all
 * the Push API needs: the subscription is bound to the registration, and the
 * `notificationclick` handler may open any same-origin URL (the DSH root '/').
 */
/** Build the service worker JavaScript served at /dsh-web-push/sw.js. */
export declare function serviceWorkerSource(): string;
declare const ICON_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">\n<rect width=\"512\" height=\"512\" rx=\"96\" fill=\"#4D6BFE\"/>\n<path d=\"M256 96c-70 0-128 52-128 118v74l-30 62c-4 9 2 18 12 18h66c14 30 44 48 80 48s66-18 80-48h66c10 0 16-9 12-18l-30-62v-74C384 148 326 96 256 96z\" fill=\"#fff\"/>\n<circle cx=\"256\" cy=\"232\" r=\"44\" fill=\"#4D6BFE\"/>\n</svg>\n";
/** Build the web manifest served at /dsh-web-push/manifest.webmanifest. */
export declare function manifestSource(): string;
export { ICON_SVG };
