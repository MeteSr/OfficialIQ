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
