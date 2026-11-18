import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, isCallbackUrl, nativeCallbackUrl, parseCallback, type PendingSignIn } from "./nativeAuth";

const CALLBACK = "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io/native-callback";
const pending: PendingSignIn = { state: "state-1", requestId: "req-1", startedAt: 1_000 };

function callbackWith(message: unknown, state = pending.state): string {
  const fragment = new URLSearchParams({ message: JSON.stringify(message), state });
  return `${CALLBACK}#${fragment}`;
}

describe("buildAuthorizeUrl", () => {
  it("puts an ICRC-167 request for a session delegation in the fragment", () => {
    const url = new URL(buildAuthorizeUrl({
      sessionPublicKey: new Uint8Array([1, 2, 3]),
      callbackUrl: CALLBACK,
      state: "s",
      requestId: "r",
    }));
    expect(`${url.origin}${url.pathname}`).toBe("https://id.ai/authorize");
    expect(url.search).toBe("");
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("callback")).toBe(CALLBACK);
    expect(params.get("state")).toBe("s");
    expect(JSON.parse(params.get("message")!)).toEqual({
      jsonrpc: "2.0",
      id: "r",
      method: "ii_session_delegation",
      params: { sessionPublicKey: "AQID" },
    });
  });
});

describe("nativeCallbackUrl / isCallbackUrl", () => {
  it("builds the callback from an origin, dropping any path", () => {
    expect(nativeCallbackUrl("https://example.org/some/page")).toBe("https://example.org/native-callback");
  });

  it("refuses to build one without an origin", () => {
    expect(() => nativeCallbackUrl("")).toThrow();
  });

  it("matches the callback with or without a fragment, and nothing else", () => {
    expect(isCallbackUrl(`${CALLBACK}#message=x`, CALLBACK)).toBe(true);
    expect(isCallbackUrl(CALLBACK, CALLBACK)).toBe(true);
    expect(isCallbackUrl("https://evil.example/native-callback#message=x", CALLBACK)).toBe(false);
    expect(isCallbackUrl("https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io/home", CALLBACK)).toBe(false);
    expect(isCallbackUrl("not a url", CALLBACK)).toBe(false);
  });
});

describe("parseCallback", () => {
  const response = { jsonrpc: "2.0", id: "req-1", result: { publicKey: "AA==", signerDelegation: [] } };

  it("returns the response for this sign-in", () => {
    expect(parseCallback(callbackWith(response), pending, 2_000)).toEqual(response);
  });

  it("finds the response in a batch", () => {
    const other = { jsonrpc: "2.0", id: "other", result: {} };
    expect(parseCallback(callbackWith([other, response]), pending, 2_000)).toEqual(response);
  });

  it("refuses a callback from a sign-in this device didn't start", () => {
    expect(() => parseCallback(callbackWith(response, "someone-else"), pending, 2_000)).toThrow(/not for this sign-in/);
  });

  it("refuses an answer to a different request", () => {
    expect(() => parseCallback(callbackWith({ ...response, id: "req-2" }), pending, 2_000)).toThrow(/different request/);
  });

  it("refuses a callback after the flow timed out", () => {
    expect(() => parseCallback(callbackWith(response), pending, pending.startedAt + 11 * 60 * 1000)).toThrow(/too long/);
  });

  it("refuses a callback without a response", () => {
    expect(() => parseCallback(CALLBACK, pending, 2_000)).toThrow(/no response/);
  });
});
