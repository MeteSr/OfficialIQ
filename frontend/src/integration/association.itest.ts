import { beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// Assignment completions come from graded sessions on the assignment's
// articles; coordinators read their members' results and exam history.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

async function makeCoordinator() {
  const c = newIdentity();
  ok(await (await canister("user", c)).createProfile({ displayName: "Coord", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" }));
  ok(await (await adminCall("user")).setRole(c.getPrincipal(), { Coordinator: null }));
  return c;
}

describe("associations", () => {
  it("records a graded completion and shows it to the coordinator", async () => {
    const coord = await makeCoordinator();
    const member = newIdentity();
    const assocC = await canister("association", coord);
    const assoc = ok(await assocC.createAssociation("Test Assoc", bank.sportId)) as { id: string; joinCode: string };
    ok(await (await canister("association", member)).joinAssociation(assoc.joinCode));

    const due = BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n;
    const asg = ok(await assocC.createAssignment(assoc.id, "Read art 1", [bank.art1], false, due, [])) as { id: string };

    const s = await start(member, bank, 5);
    await play(member, bank, s, 3);
    const assocM = await canister("association", member);
    const c = ok(await assocM.recordGradedCompletion(asg.id, s.session.id)) as { score: bigint };
    expect(c.score).toBe(60n);
    expect(err(await assocM.recordGradedCompletion(asg.id, s.session.id))).toMatch(/already used/);

    // A retake replaces the completion rather than adding a second one.
    const retake = await start(member, bank, 5);
    await play(member, bank, retake, 5);
    ok(await assocM.recordGradedCompletion(asg.id, retake.session.id));

    const mine = (await assocM.getMyCompletions()) as { assignmentId: string; score: bigint }[];
    expect(mine).toHaveLength(1);
    expect(mine[0].score).toBe(100n);
    const all = ok(await assocC.getAssignmentCompletions(asg.id)) as { member: { toText(): string } }[];
    expect(all.map(x => x.member.toText())).toEqual([member.getPrincipal().toText()]);

    const coordinated = (await assocC.getMyCoordinatedAssociations()) as { id: string }[];
    expect(coordinated.map(a => a.id)).toEqual([assoc.id]);

    // Coordinators see their members' exam history; nobody else does.
    const viaCoord = (await (await canister("exam", coord)).getMemberExams(member.getPrincipal())) as { id: string }[];
    expect(viaCoord.map(x => x.id)).toContain(s.session.id);
    const viaStranger = (await (await canister("exam", newIdentity())).getMemberExams(member.getPrincipal())) as unknown[];
    expect(viaStranger).toEqual([]);
  });

  it("only lets admin-made coordinators create associations", async () => {
    const official = newIdentity();
    expect(err(await (await canister("association", official)).createAssociation("Nope", bank.sportId))).toMatch(/coordinator access/);
  });
});
