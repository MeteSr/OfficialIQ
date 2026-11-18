import { beforeAll, describe, expect, it } from "vitest";
import { canister, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// Leaderboard results come from the exam canister's grading (claimExamResult
// reads exam.gradedResult); each finished session counts once.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

type Stats = { examCount: bigint; accuracy: number; elo: number; state: string };

describe("claimExamResult", () => {
  it("counts a finished session once, with the canister's score", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);
    const ranking = await canister("ranking", a);

    const stats = ok(await ranking.claimExamResult(s.session.id, "Ref A", "OH")) as Stats;
    expect(stats.examCount).toBe(1n);
    expect(stats.accuracy).toBeCloseTo(1.0);
    expect(stats.elo).toBeGreaterThan(1000);
    expect(stats.state).toBe("OH");

    expect(err(await ranking.claimExamResult(s.session.id, "Ref A", "OH"))).toMatch(/Already counted/);
  });

  it("refuses someone else's session", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);
    const thief = await canister("ranking", newIdentity());
    expect(err(await thief.claimExamResult(s.session.id, "Thief", ""))).toMatch(/Not your exam/);
  });

  it("refuses an unfinished session", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    expect(err(await (await canister("ranking", a)).claimExamResult(s.session.id, "Ref", ""))).toMatch(/No finished graded exam/);
  });

  it("refuses a session too short to rank", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 3);
    await play(a, bank, s, 3);
    expect(err(await (await canister("ranking", a)).claimExamResult(s.session.id, "Ref", ""))).toMatch(/at least 5/);
  });

  it("keeps a profile without a state off every state board", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);
    const ranking = await canister("ranking", a);
    ok(await ranking.claimExamResult(s.session.id, "No State", ""));
    const tx = (await ranking.getState(bank.sportId, "TX", 100n, { Elo: null })) as { principal: { toText(): string } }[];
    expect(tx.map(e => e.principal.toText())).not.toContain(a.getPrincipal().toText());
    const national = (await ranking.getNational(bank.sportId, 100n, { Elo: null })) as { principal: { toText(): string } }[];
    expect(national.map(e => e.principal.toText())).toContain(a.getPrincipal().toText());
  });
});
