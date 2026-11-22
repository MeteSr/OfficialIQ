import { expect, type Locator, type Page } from "@playwright/test";
import en from "../../src/i18n/en.json";
import { CORRECT_CHOICE, WRONG_CHOICES } from "./seed";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const STEM = /E2E (basketball|football) rule \d+ question \d+: what is the call\?/;

/** The question on screen (seeded stems are unique). */
export async function currentStem(page: Page): Promise<string> {
  return (await page.getByText(STEM).first().innerText()).trim();
}

/**
 * Plays a one-question-at-a-time quiz (QuizPage, ChallengePage): picks the
 * right or wrong answer for each question, waits for it to be marked, and
 * moves on until `done` shows. Returns the stems it saw, in order.
 */
export async function playQuiz(
  page: Page,
  opts: { correct?: (i: number) => boolean; done?: Locator; onQuestion?: (i: number) => Promise<void> } = {},
): Promise<string[]> {
  const done = opts.done ?? page.getByText(en.quiz.complete);
  const next = page.getByRole("button", {
    name: new RegExp(`^(${escape(en.challenge.nextQuestion)}|${escape(en.challenge.finish)})$`),
  });
  const stems: string[] = [];
  for (let i = 0; i < 200; i++) {
    const right = page.getByRole("button", { name: CORRECT_CHOICE });
    await expect(right.or(done).first()).toBeVisible({ timeout: 60_000 });
    if (await done.isVisible()) return stems;
    stems.push(await currentStem(page));
    await opts.onQuestion?.(i);
    const answerRight = opts.correct ? opts.correct(i) : true;
    await (answerRight ? right : page.getByRole("button", { name: WRONG_CHOICES[0] })).click();
    // Graded: the canister marks it, then the right answer and its rule show.
    await expect(page.getByText(`${en.challenge.correct} —`, { exact: false })).toBeVisible({ timeout: 60_000 });
    await expect(next).toBeEnabled();
    await next.click();
    const seen = stems[stems.length - 1];
    await expect(async () => {
      if (await done.isVisible()) return;
      expect(await currentStem(page)).not.toBe(seen);
    }).toPass({ timeout: 60_000 });
  }
  throw new Error("quiz never finished");
}
