import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { userService } from "../services/user";

const VAPID_PUBLIC_KEY = typeof VITE_VAPID_PUBLIC_KEY !== "undefined" ? VITE_VAPID_PUBLIC_KEY : "";

// applicationServerKey must be a Uint8Array, but is handed out as a
// URL-safe base64 string.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isWebPushSupported(): boolean {
  return !Capacitor.isNativePlatform() && "serviceWorker" in navigator && "PushManager" in window;
}

export async function isPushConfigured(): Promise<boolean> {
  return (await userService.getMyPushSubscription()) !== null;
}

// Registers this device for push, storing whichever subscription shape
// applies (Web Push in a browser/PWA tab, a native FCM/APNs token inside a
// Capacitor shell — see issue #31) under the same canister slot.
export async function enablePush(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") throw new Error("Notification permission denied");
    // The actual token arrives asynchronously via the 'registration'
    // listener (see registerNativePushListener, wired once at app start)
    // — register() just kicks off that flow.
    await PushNotifications.register();
    return;
  }

  if (!isWebPushSupported()) throw new Error("Push notifications aren't supported in this browser");
  if (!VAPID_PUBLIC_KEY) throw new Error("Push notifications aren't configured yet — ask an admin to set VAPID_PUBLIC_KEY");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission denied");

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser returned an incomplete push subscription");
  }
  await userService.registerPushSubscription({
    WebPush: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

export async function disablePush(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.unregister().catch(() => {});
  } else if (isWebPushSupported()) {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => {});
  }
  await userService.unregisterPushSubscription();
}

// Call once at app start (native shells only — no-op on web). The token
// itself can't be requested synchronously; it shows up via this listener
// some time after PushNotifications.register() resolves.
export function registerNativePushListener() {
  if (!Capacitor.isNativePlatform()) return;
  PushNotifications.addListener("registration", (token) => {
    userService.registerPushSubscription({
      Native: { token: token.value, platform: Capacitor.getPlatform() },
    }).catch(() => {});
  });
}
