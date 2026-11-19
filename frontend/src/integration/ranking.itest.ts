import { beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "@icp-sdk/core/agent";
import { canister, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// A finished quiz or exam is pushed by the exam canister to ranking (ELO,
// streak, skill counters), question (spaced-repetition history) and user
// (article progress) from a timer, so these tests wait for it to land.
// claimExamResult stays for older apps; each session still counts once.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

type Stats = { examCount: bigint; accuracy: number; elo: number; state: string; displayName: string };

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, what: string): Promise<T> {
  const until = Date.now() + 30_000;
  for (;;) {
    const v = await read();
    if (done(v)) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 500));
  }
}

async function official(name: string, state: string): Promise<Identity> {
  const who = newIdentity();
  ok(await (await canister("user", who)).createProfile({ displayName: name, sport: bank.sportId, level: "varsity", state, preferredLanguage: "en" }));
  return who;
}

async function statsOnce(who: Identity): Promise<Stats> {
  const ranking = await canister("ranking", who);
  const [s] = await eventually(
    async () => (await ranking.getMyStats()) as [] | [Stats],
    v => v.length === 1, "the ranked result",
  );
  return s!;
}

describe("results pushed by the exam canister", () => {
  it("counts a finished session once, with the canister's score and the profile's name and state", async () => {
    const a = await official("Ref A", "OH");
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);

    const stats = await statsOnce(a);
    expect(stats.examCount).toBe(1n);
    expect(stats.accuracy).toBeCloseTo(1.0);
    expect(stats.elo).toBeGreaterThan(1000);
    expect(stats.displayName).toBe("Ref A");
    expect(stats.state).toBe("OH");

    // An older app claiming the same session doesn't count it again.
    const ranking = await canister("ranking", a);
    expect(err(await ranking.claimExamResult(s.session.id, "Ref A", "OH"))).toMatch(/Already counted/);
  });

  it("feeds the daily streak, skill counters, question history and article progress", async () => {
    const a = await official("Ref B", "OH");
    const s = await start(a, bank, 6);
    await play(a, bank, s, 4);

    const ranking = await canister("ranking", a);
    const day = await eventually(
      async () => (await ranking.getDailyStreak()) as { answeredToday: bigint; currentStreak: bigint },
      d => d.answeredToday > 0n, "the daily streak",
    );
    expect(day.answeredToday).toBe(6n);
    expect(day.currentStreak).toBe(1n);
    const skills = (await ranking.getSkillCounters()) as { speedStreak: bigint; bestSpeedStreak: bigint };
    // play() answers in 5s: four right in a row, then wrong.
    expect(skills.bestSpeedStreak).toBe(4n);
    expect(skills.speedStreak).toBe(0n);

    const history = await eventually(
      async () => (await (await canister("question", a)).getMyHistoryBatch(s.session.questionIds)) as ([] | [{ timesAnswered: bigint }])[],
      h => h.every(x => x.length === 1), "spaced-repetition history",
    );
    expect(history.map(h => h[0]?.timesAnswered)).toEqual(Array(6).fill(1n));

    const progress = await eventually(
      async () => (await (await canister("user", a)).getMyProgress()) as { articleId: string; masteryScore: bigint }[],
      p => p.length > 0, "article progress",
    );
    expect(progress).toEqual([expect.objectContaining({ articleId: bank.art1, masteryScore: 66n })]);
  });

  it("weights the rating by question difficulty", async () => {
    const hard = await seedBank(6, 0, "Expert");
    const easyPlayer = await official("Easy", "OH");
    const hardPlayer = await official("Hard", "OH");
    await play(easyPlayer, bank, await start(easyPlayer, bank, 5), 5);
    await play(hardPlayer, hard, await start(hardPlayer, hard, 5), 5);
    const easy = await statsOnce(easyPlayer);
    const tough = await statsOnce(hardPlayer);
    // All correct either way, but beating Expert questions is worth more.
    expect(easy.elo).toBeGreaterThan(1000);
    expect(tough.elo).toBeGreaterThan(easy.elo);
  });

  it("follows a renamed official onto the leaderboard", async () => {
    const a = await official("Old Name", "OH");
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);
    await statsOnce(a);

    ok(await (await canister("user", a)).updateProfile({ displayName: "New Name", sport: bank.sportId, level: "varsity", state: "KY", preferredLanguage: "en" }));
    const ranking = await canister("ranking", a);
    const [after] = await eventually(
      async () => (await ranking.getMyStats()) as [] | [Stats],
      v => v[0]?.displayName === "New Name", "the rename",
    );
    expect(after!.state).toBe("KY");
  });

  it("keeps a profile without a state off every state board", async () => {
    const a = await official("No State", "");
    const s = await start(a, bank, 5);
    await play(a, bank, s, 5);
    await statsOnce(a);
    const ranking = await canister("ranking", a);
    const tx = (await ranking.getState(bank.sportId, "TX", 100n, { Elo: null })) as { principal: { toText(): string } }[];
    expect(tx.map(e => e.principal.toText())).not.toContain(a.getPrincipal().toText());
    const national = (await ranking.getNational(bank.sportId, 100n, { Elo: null })) as { principal: { toText(): string } }[];
    expect(national.map(e => e.principal.toText())).toContain(a.getPrincipal().toText());
  });

  it("only takes pushes from the exam canister", async () => {
    const r = await canister("ranking", newIdentity());
    const fake = {
      id: "ex_fake", owner: newIdentity().getPrincipal(), mode: { Solo: null }, sportId: bank.sportId,
      articleIds: [], questionIds: [], questionCount: 10n, answered: 10n, correct: 10n, score: 100n,
      avgElapsedSec: 1n, finishedAt: 0n,
    };
    expect(err(await r.recordGradedSession(fake, []))).toMatch(/Exam canister only/);
    const q = await canister("question", newIdentity());
    expect(err(await q.recordGradedAnswers(newIdentity().getPrincipal(), "ex_fake", []))).toMatch(/Exam canister only/);
    const u = await canister("user", newIdentity());
    expect(err(await u.recordGradedStudy(newIdentity().getPrincipal(), "ex_fake", []))).toMatch(/Exam canister only/);
  });
});

describe("claimExamResult (older apps)", () => {
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
});
