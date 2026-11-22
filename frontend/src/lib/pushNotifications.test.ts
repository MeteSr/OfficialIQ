import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unregister = vi.fn(async () => {});
vi.mock("../services/user", () => ({ userService: { unregisterPushSubscription: () => unregister() } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {} }));

import { disablePush } from "./pushNotifications";

// Deleting an account turns push off first. With no service worker
// registered (vite dev, or one that failed to install),
// navigator.serviceWorker.ready never settles, which left deletion stuck
// on "Deleting…".

describe("disablePush", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

  beforeEach(() => {
    unregister.mockClear();
    (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  });
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "serviceWorker", original);
    else delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  });

  function serviceWorker(registration: unknown) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: new Promise(() => {}), getRegistration: async () => registration },
    });
  }

  it("finishes when no service worker is registered", async () => {
    serviceWorker(undefined);
    await expect(disablePush()).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("unsubscribes this browser when it has a push subscription", async () => {
    const unsubscribe = vi.fn(async () => true);
    serviceWorker({ pushManager: { getSubscription: async () => ({ unsubscribe }) } });
    await disablePush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
  });
});
