import { describe, expect, it } from "vitest";
import { canister, ok, err } from "./harness";
import { newIdentity } from "./identities";

// Mentorship (manual test plan case 18): an official shares an exam's
// answers by link; whoever opens it first becomes the mentor, annotates the
// misses, and the official sees the notes.

type Link = { id: string; token: string; owner: { toText(): string }; mentorPrincipal: [] | [{ toText(): string }]; revoked: boolean };
type Note = { id: string; note: string; questionId: string; seen: boolean };

const answers = [
  { questionId: "q1", chosenId: "a", correctId: "a", isCorrect: true, elapsedSec: 4n },
  { questionId: "q2", chosenId: "b", correctId: "c", isCorrect: false, elapsedSec: 9n },
];

async function share(owner = newIdentity()) {
  const m = await canister("mentorship", owner);
  const link = ok(await m.createMentorLink(`exam-${Date.now()}`, "itest_sport", 50n, [6n], answers)) as Link;
  return { owner, m, link };
}

describe("sharing exam answers with a mentor", () => {
  it("binds the link to the first official who opens it", async () => {
    const { owner, link } = await share();
    expect(link.mentorPrincipal).toEqual([]);
    expect(link.token).not.toBe(link.id);

    const mentor = newIdentity();
    const opened = ok(await (await canister("mentorship", mentor)).openMentorLink(link.token)) as Link & { answers: typeof answers };
    expect(opened.mentorPrincipal[0]?.toText()).toBe(mentor.getPrincipal().toText());
    expect(opened.answers.map(a => a.questionId)).toEqual(["q1", "q2"]);

    // The mentor can open it again; nobody else can claim it now.
    ok(await (await canister("mentorship", mentor)).openMentorLink(link.token));
    expect(err(await (await canister("mentorship", newIdentity())).openMentorLink(link.token))).toMatch(/different mentor/);
    // The owner can always preview it.
    ok(await (await canister("mentorship", owner)).openMentorLink(link.token));

    const dash = (await (await canister("mentorship", mentor)).getMentorDashboard()) as Link[];
    expect(dash.map(l => l.id)).toContain(link.id);
  });

  it("lets only the bound mentor annotate, and the owner sees and clears the notes", async () => {
    const { m: ownerActor, link } = await share();
    const mentor = newIdentity();
    const mentorActor = await canister("mentorship", mentor);

    expect(err(await mentorActor.addAnnotation(link.id, "q2", "Too early"))).toMatch(/No mentor has claimed/);
    ok(await mentorActor.openMentorLink(link.token));
    const note = ok(await mentorActor.addAnnotation(link.id, "q2", "Review Art. 4.4b")) as Note;
    expect(err(await (await canister("mentorship", newIdentity())).addAnnotation(link.id, "q2", "Not mine"))).toMatch(/Not the mentor/);
    expect(err(await mentorActor.addAnnotation(link.id, "q2", "x".repeat(5_000)))).toMatch(/too long/);

    expect(await ownerActor.getMyUnseenAnnotationCount()).toBe(1n);
    const mine = (await ownerActor.getMyAnnotations()) as Note[];
    expect(mine.map(n => n.note)).toEqual(["Review Art. 4.4b"]);
    expect((ok(await ownerActor.getAnnotationsForLink(link.id)) as Note[]).map(n => n.id)).toEqual([note.id]);
    expect(err(await (await canister("mentorship", newIdentity())).getAnnotationsForLink(link.id))).toMatch(/Not authorized/);

    expect(err(await mentorActor.markAnnotationSeen(note.id))).toMatch(/Not your annotation/);
    ok(await ownerActor.markAnnotationSeen(note.id));
    expect(await ownerActor.getMyUnseenAnnotationCount()).toBe(0n);
  });

  it("closes a revoked link to everyone, mentor included", async () => {
    const { m: ownerActor, link } = await share();
    const mentorActor = await canister("mentorship", newIdentity());
    ok(await mentorActor.openMentorLink(link.token));

    expect(err(await mentorActor.revokeMentorLink(link.id))).toMatch(/Not your link/);
    ok(await ownerActor.revokeMentorLink(link.id));
    expect(err(await mentorActor.openMentorLink(link.token))).toMatch(/revoked/);
    expect(err(await mentorActor.addAnnotation(link.id, "q2", "Late note"))).toMatch(/revoked/);
    expect(((await ownerActor.getMyMentorLinks()) as Link[]).find(l => l.id === link.id)?.revoked).toBe(true);
  });

  it("refuses a token it never issued", async () => {
    expect(err(await (await canister("mentorship", newIdentity())).openMentorLink("tok-not-a-real-token"))).toMatch(/not found/);
  });
});
