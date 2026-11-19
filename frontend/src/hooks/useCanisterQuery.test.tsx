import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCanisterQuery } from "./useCanisterQuery";

describe("useCanisterQuery", () => {
  it("reports a failure instead of swallowing it, and retries", async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useCanisterQuery(() => (fail ? Promise.reject(new Error("canister down")) : Promise.resolve([1, 2])), []),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("canister down");
    expect(result.current.data).toBeUndefined();

    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));
    expect(result.current.error).toBeNull();
  });

  it("ignores a response that arrives after a newer request", async () => {
    const resolvers: ((v: string) => void)[] = [];
    const { result, rerender } = renderHook(({ key }) =>
      useCanisterQuery(() => new Promise<string>((r) => resolvers.push(r)), [key]), { initialProps: { key: "a" } },
    );
    rerender({ key: "b" });
    await act(async () => { resolvers[1]("b"); });
    await act(async () => { resolvers[0]("a"); });
    expect(result.current.data).toBe("b");
  });
});
