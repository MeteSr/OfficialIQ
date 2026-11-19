import { beforeAll, describe, expect, it } from "vitest";
import { canister } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, type Bank } from "./fixtures";

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

describe("most-missed questions", () => {
  it("ranks questions by miss rate across officials", async () => {
    const [hard, easy] = bank.ruleIds;
    for (let i = 0; i < 3; i++) {
      const q = await canister("question", newIdentity());
      await q.recordAnswer(hard, false);
      await q.recordAnswer(easy, true);
    }
    const missed = (await (await canister("question", newIdentity())).getMostMissedQuestions(bank.sportId, 10n)) as [string, bigint, bigint][];
    expect(missed[0]).toEqual([hard, 3n, 3n]);
    expect(missed.find(([id]) => id === easy)).toEqual([easy, 0n, 3n]);
  });
});

describe("answer rates", () => {
  it("returns wrong and answered counts for the asked questions only", async () => {
    const [, , third] = bank.ruleIds;
    for (let i = 0; i < 4; i++) {
      const q = await canister("question", newIdentity());
      await q.recordAnswer(third, i === 0 ? false : true);
    }
    const rates = (await (await canister("question", newIdentity())).getAnswerRates([third, "no-such-question"])) as [string, bigint, bigint][];
    expect(rates).toEqual([[third, 1n, 4n]]);
  });
});

describe("offline sync", () => {
  it("pages through a sport's whole bank", async () => {
    const q = await canister("question", newIdentity());
    const seen: string[] = [];
    let after: [] | [string] = [];
    for (let pages = 0; ; pages++) {
      const page = (await q.listForSync(bank.sportId, after, 5n)) as { questions: { id: string; sportId: string }[]; next: [] | [string] };
      expect(page.questions.every(x => x.sportId === bank.sportId)).toBe(true);
      seen.push(...page.questions.map(x => x.id));
      if (page.next.length === 0) break;
      expect(pages).toBeLessThan(10);
      after = page.next;
    }
    expect(seen.sort()).toEqual([...bank.ruleIds, ...bank.casebookIds].sort());
  });
});
