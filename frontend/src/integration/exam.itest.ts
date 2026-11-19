import { beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, config, wrongChoice, type Bank } from "./fixtures";

// Ranked quizzes and certification exams are graded by the exam canister:
// the player never sees an answer before answering, each answer counts once,
// and the score is computed here, not in the browser.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

describe("graded sessions", () => {
  it("hands out questions without their answers", async () => {
    const s = await start(newIdentity(), bank, 5);
    expect(s.questions).toHaveLength(5);
    expect(s.session.questionIds).toEqual(s.questions.map(q => q.id));
    for (const q of s.questions) {
      expect(q).not.toHaveProperty("correctId");
      expect(q).not.toHaveProperty("explanation");
    }
  });

  it("grades each answer once and reveals it", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    const exam = await canister("exam", a);
    const [q0, q1] = s.session.questionIds;

    const right = ok(await exam.answerQuestion(s.session.id, q0, bank.answer.get(q0)!, 4n)) as { isCorrect: boolean; correctId: string };
    expect(right.isCorrect).toBe(true);
    expect(right.correctId).toBe(bank.answer.get(q0));

    const wrong = ok(await exam.answerQuestion(s.session.id, q1, wrongChoice(bank, q1), 4n)) as { isCorrect: boolean; correctId: string };
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.correctId).toBe(bank.answer.get(q1));

    expect(err(await exam.answerQuestion(s.session.id, q1, bank.answer.get(q1)!, 4n))).toMatch(/Already answered/);
    expect(err(await exam.answerQuestion(s.session.id, "q-not-in-exam", "a", 4n))).toMatch(/Not a question in this exam/);
  });

  it("only lets the owner answer or finish a session", async () => {
    const s = await start(newIdentity(), bank, 5);
    const other = await canister("exam", newIdentity());
    const qid = s.session.questionIds[0];
    expect(err(await other.answerQuestion(s.session.id, qid, bank.answer.get(qid)!, 1n))).toMatch(/Not your session/);
    expect(err(await other.finishSession(s.session.id))).toMatch(/Not your session/);
  });

  it("scores unanswered questions as wrong, and finishing is final", async () => {
    const a = newIdentity();
    const s = await start(a, bank, 5);
    const exam = await canister("exam", a);
    const [q0, q1, q2] = s.session.questionIds;
    ok(await exam.answerQuestion(s.session.id, q0, bank.answer.get(q0)!, 3n));
    ok(await exam.answerQuestion(s.session.id, q1, bank.answer.get(q1)!, 3n));
    ok(await exam.answerQuestion(s.session.id, q2, wrongChoice(bank, q2), 3n));

    const done = ok(await exam.finishSession(s.session.id)) as {
      session: { score: [] | [bigint]; finishedAt: [] | [bigint] };
      feedback: { questionId: string; correctId: string; isCorrect: boolean }[];
    };
    expect(done.session.score).toEqual([40n]); // 2 of 5
    expect(done.feedback).toHaveLength(5);
    for (const f of done.feedback) expect(f.correctId).toBe(bank.answer.get(f.questionId));

    const q3 = s.session.questionIds[3];
    expect(err(await exam.answerQuestion(s.session.id, q3, bank.answer.get(q3)!, 3n))).toMatch(/finished/);

    const again = ok(await exam.finishSession(s.session.id)) as typeof done;
    expect(again.session.score).toEqual([40n]);
    expect(again.session.finishedAt).toEqual(done.session.finishedAt);
  });

  it("grades a certification-style batch, counting each question once", async () => {
    const a = newIdentity();
    const exam = await canister("exam", a);
    const s = ok(await exam.startGradedSession(config(bank, 5, "Certification"),
      { Picks: [{ articleIds: [bank.art1], casebook: false, count: 5n, difficulty: [], adaptive: false, tag: [] }] })) as
      { session: { id: string; questionIds: string[] } };
    const ids = s.session.questionIds;
    const batch: [string, string, bigint][] = ids.map(id => [id, bank.answer.get(id)!, 10n]);
    batch.push([ids[0], wrongChoice(bank, ids[0]), 10n]); // a second answer to the same question is ignored
    const done = ok(await exam.submitGradedAnswers(s.session.id, batch)) as { session: { score: [] | [bigint] } };
    expect(done.session.score).toEqual([100n]);
  });

  it("picks different questions across attempts", async () => {
    const a = newIdentity();
    const sets = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const s = await start(a, bank, 5);
      sets.add([...s.session.questionIds].sort().join(","));
    }
    // 5 of 12 questions: identical draws on all 5 attempts would be a
    // ~1-in-10^10 fluke, not chance.
    expect(sets.size).toBeGreaterThan(1);
  });

  it("lists a player's own sessions only", async () => {
    const a = newIdentity();
    const b = newIdentity();
    const s1 = await start(a, bank, 5);
    const s2 = await start(a, bank, 5);
    await start(b, bank, 5);
    const mine = (await (await canister("exam", a)).getMyExams()) as { id: string }[];
    expect(mine.map(s => s.id).sort()).toEqual([s1.session.id, s2.session.id].sort());
    const others = (await (await canister("exam", b)).getMyExams()) as { id: string }[];
    expect(others.map(s => s.id)).not.toContain(s1.session.id);
  });

  it("serves the answer key only to the exam canister", async () => {
    const q = await adminCall("question", newIdentity());
    expect(err(await q.questionsForExam(bank.ruleIds.slice(0, 2)))).toMatch(/Exam canister only/);
  });

  it("scores a played session from the canister's own grading", async () => {
    const a = newIdentity();
    const { score } = await play(a, bank, await start(a, bank, 5), 4);
    expect(score).toBe(80n);
  });
});
