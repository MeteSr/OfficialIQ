/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Handles a Web Push message (issue #28) delivered via
// scripts/send-pending-push.mjs: a streak milestone, or a game-day
// refresher naming the official's own game. Web Push encrypts it to this
// browser, and it's read as plain JSON.
self.addEventListener("push", (event: PushEvent) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = payload.title ?? "OfficialIQ";
  const url = payload.url ?? "/home";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      tag: "officialiq-milestone",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      return self.clients.openWindow?.(url);
    }),
  );
});
