import { beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "@icp-sdk/core/agent";
import { adminCall, canister, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, play, config, start, wrongChoice, type Bank, type Start } from "./fixtures";

// Game-day refresher (#63) and crew pregame (#64).

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

type CrewResult = { principal: { toText(): string }; score: bigint; missed: string[] };
type Crew = { id: string; code: string; questionIds: string[]; members: unknown[]; results: CrewResult[] };

const HOUR_NS = 3_600_000_000_000n;
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

async function newCrew(who: Identity, ids: string[]): Promise<Crew> {
  return ok(await (await canister("challenge", who)).createCrew({
    gameLabel: "Central vs North", gameDate: nowNs() + 3n * HOUR_NS,
    sportId: bank.sportId, levelId: "varsity", questionIds: ids,
  })) as Crew;
}

async function startSet(who: Identity, ids: string[]): Promise<Start> {
  return ok(await (await canister("exam", who)).startGradedSession(config(bank, ids.length, "Solo"), { Ids: ids })) as Start;
}

describe("crew pregame", () => {
  it("shares one question set and each member's verified misses", async () => {
    const a = newIdentity();
    const b = newIdentity();
    const ids = bank.ruleIds.slice(0, 4);
    const crew = await newCrew(a, ids);

    const preview = (await (await canister("challenge", b)).getCrewPreview(crew.code.toLowerCase())) as [{ memberCount: bigint }];
    expect(preview[0].memberCount).toBe(1n);
    ok(await (await canister("challenge", b)).joinCrew(crew.code));

    const sa = await startSet(a, ids);
    await play(a, bank, sa, 4);
    ok(await (await canister("challenge", a)).submitCrewResult(crew.id, sa.session.id));

    const sb = await startSet(b, ids);
    await play(b, bank, sb, 1); // misses the last three
    const done = ok(await (await canister("challenge", b)).submitCrewResult(crew.id, sb.session.id)) as Crew;

    const byWho = new Map(done.results.map(r => [r.principal.toText(), r]));
    expect(byWho.get(a.getPrincipal().toText())).toMatchObject({ score: 100n, missed: [] });
    expect(byWho.get(b.getPrincipal().toText())).toMatchObject({ score: 25n, missed: ids.slice(1) });
    expect(err(await (await canister("challenge", b)).submitCrewResult(crew.id, sb.session.id))).toMatch(/already used/);
  });

  it("keeps the crew to its members", async () => {
    const a = newIdentity();
    const ids = bank.ruleIds.slice(0, 3);
    const crew = await newCrew(a, ids);
    const outsider = newIdentity();
    expect(await (await canister("challenge", outsider)).getCrew(crew.id)).toEqual([]);
    const s = await startSet(outsider, ids);
    await play(outsider, bank, s, 3);
    expect(err(await (await canister("challenge", outsider)).submitCrewResult(crew.id, s.session.id))).toMatch(/Not in this crew/);
  });

  it("refuses a session on other questions", async () => {
    const a = newIdentity();
    const crew = await newCrew(a, bank.ruleIds.slice(0, 3));
    const other = await startSet(a, bank.ruleIds.slice(3, 6));
    await play(a, bank, other, 3);
    expect(err(await (await canister("challenge", a)).submitCrewResult(crew.id, other.session.id))).toMatch(/doesn't match/);
  });

  it("refuses a game that's already over", async () => {
    const res = await (await canister("challenge", newIdentity())).createCrew({
      gameLabel: "Old game", gameDate: nowNs() - 24n * HOUR_NS, sportId: bank.sportId, levelId: "varsity", questionIds: bank.ruleIds.slice(0, 2),
    });
    expect(err(res)).toMatch(/already over/);
  });

  it("only lets the owner or a sibling canister read a session's misses", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 2);
    await play(a, bank, s, 0);
    expect(await (await canister("exam", a)).gradedMisses(s.session.id)).toEqual([s.session.questionIds]);
    expect(await (await canister("exam", newIdentity())).gradedMisses(s.session.id)).toEqual([]);
  });
});

describe("game-day refresher", () => {
  it("ranks the caller's own most-missed articles", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 3);
    const exam = await canister("exam", a);
    for (const qid of s.session.questionIds) ok(await exam.answerQuestion(s.session.id, qid, wrongChoice(bank, qid), 5n));
    ok(await exam.finishSession(s.session.id));
    // The exam canister forwards answers to the question canister in the background.
    let rows: [string, bigint, bigint][] = [];
    for (let i = 0; i < 20 && rows.length === 0; i++) {
      rows = await (await canister("question", a)).getMyWeakArticles(bank.sportId, 5n);
      if (rows.length === 0) await new Promise(r => setTimeout(r, 500));
    }
    expect(rows).toEqual([[bank.art1, 3n, 3n]]);
    expect(await (await canister("question", newIdentity())).getMyWeakArticles(bank.sportId, 5n)).toEqual([]);
  });

  it("lists a timed game within two hours once, for officials with push", async () => {
    const a = newIdentity();
    const user = await canister("user", a);
    const soon = ok(await user.addUpcomingGame({
      opponent: "Central vs North", gameDate: nowNs() + HOUR_NS, sportId: bank.sportId, levelId: "varsity", notes: "", hasStartTime: [true],
    })) as { id: string };
    const later = ok(await user.addUpcomingGame({
      opponent: "Later", gameDate: nowNs() + 5n * HOUR_NS, sportId: bank.sportId, levelId: "varsity", notes: "", hasStartTime: [true],
    })) as { id: string };
    const dateOnly = ok(await user.addUpcomingGame({
      opponent: "Date only", gameDate: nowNs() + HOUR_NS, sportId: bank.sportId, levelId: "varsity", notes: "", hasStartTime: [],
    })) as { id: string };

    const admin = await adminCall("user");
    const pendingIds = async () => (ok(await admin.getPendingGameDayPushes()) as { game: { id: string } }[]).map(p => p.game.id);

    // No subscription yet: nothing to send.
    expect(await pendingIds()).not.toContain(soon.id);
    ok(await user.registerPushSubscription({ WebPush: { endpoint: "https://push.example/x", p256dh: "k", auth: "a" } }));
    const ids = await pendingIds();
    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(later.id);
    expect(ids).not.toContain(dateOnly.id);

    ok(await admin.ackGameDayPush(soon.id));
    expect(await pendingIds()).not.toContain(soon.id);
    expect(err(await user.getPendingGameDayPushes())).toMatch(/Admin only/);
  });
});
