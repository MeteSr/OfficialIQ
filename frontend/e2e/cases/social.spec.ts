import { test, expect, en, signUp, navTab, type Official } from "../support/fixtures";
import { canister, identityFromHex } from "../support/backend";
import { playQuiz } from "../support/quiz";
import { BASKETBALL } from "../support/seed";

// Manual test plan cases 11 to 14: challenges between officials, the
// leaderboards and badges.

const uniqueState = () => `R${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

async function addFriend(o: Official, friend: Official): Promise<void> {
  await navTab(o.page, "me").click();
  await o.page.getByPlaceholder(en.me.friendInputPlaceholder).fill(friend.principal.toText());
  await o.page.getByRole("button", { name: en.me.add, exact: true }).click();
  await expect(o.page.getByText(friend.name, { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** A ranked quiz, so the official is on the leaderboards. */
async function rank(o: Official, correct = true): Promise<void> {
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  await playQuiz(o.page, { correct: () => correct });
  await expect.poll(async () => ((await (await canister("ranking")).getStats(o.principal)) as unknown[]).length, { timeout: 60_000 }).toBe(1);
}

test("cases 11 and 12: a challenge stays open until accepted, then both officials see the result", async ({ newOfficial }) => {
  const a = await newOfficial();
  const b = await newOfficial();
  await signUp(a);
  await signUp(b);
  await rank(b);
  await addFriend(a, b);

  // A has no rating yet, so B tops A's Friends board.
  await navTab(a.page, "ranks").click();
  await a.page.getByRole("button", { name: en.ranks.challengeToRematch.replace("{{name}}", b.name) }).click();
  await expect(a.page).toHaveURL(/\/challenge\//);
  const challengeUrl = new URL(a.page.url()).pathname;
  await playQuiz(a.page, { correct: () => false, done: a.page.getByText(en.challenge.waitingForOpponent) });

  // Case 12, the part a test can wait for: unanswered, it stays open in B's inbox.
  // (Expiry after 72 hours is the challenge canister's rule, tested in test/ChallengeExpiry.test.mo.)
  await b.page.goto("/home");
  await expect(b.page.getByText(new RegExp(`${en.home.challengeFrom}\\s+${a.name}`))).toBeVisible({ timeout: 30_000 });
  await b.page.reload();
  await expect(b.page.getByText(new RegExp(`${en.home.challengeFrom}\\s+${a.name}`))).toBeVisible({ timeout: 30_000 });

  await b.page.getByRole("button", { name: en.home.accept }).click();
  await expect(b.page).toHaveURL(new RegExp(challengeUrl));
  await playQuiz(b.page, { done: b.page.getByText(en.challenge.youWon) });

  await a.page.goto(challengeUrl);
  await expect(a.page.getByText(en.challenge.opponentWon.replace("{{name}}", b.name))).toBeVisible({ timeout: 30_000 });
  await b.page.goto(challengeUrl);
  await expect(b.page.getByText(en.challenge.youWon)).toBeVisible();
});

test("case 13: Friends, State and National boards show the official's name and rating", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o, { state: uniqueState() });
  await rank(o);
  const stats = ((await (await canister("ranking")).getStats(o.principal)) as { elo: number; streak: bigint }[])[0];
  const elo = String(Math.round(stats.elo));

  await navTab(o.page, "ranks").click();
  for (const tab of [en.ranks.tabFriends, en.ranks.tabState]) {
    await o.page.getByRole("button", { name: tab, exact: true }).click();
    await expect(o.page.getByText(o.name, { exact: true })).toBeVisible();
    await expect(o.page.getByText(en.ranks.youTag, { exact: true })).toBeVisible();
    await expect(o.page.getByText(elo, { exact: true })).toBeVisible();
    if (Number(stats.streak) > 0) await expect(o.page.getByText(`${Number(stats.streak)}D`, { exact: true })).toBeVisible();
  }
  // National lists the top 25 across every test official; it has to load with rows.
  await o.page.getByRole("button", { name: en.ranks.tabNational, exact: true }).click();
  await expect(o.page.getByText(en.common.retry)).toHaveCount(0);
  await expect(o.page.getByText(en.ranks.challengeToRematch.split("{{")[0], { exact: false })).toBeVisible();
});

test("case 14: ten fast right answers in a row earn the Speed Demon badge on Me", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  await navTab(o.page, "me").click();
  await expect(o.page.getByText(en.badges.earnedCount.replace("{{earned}}", "0").replace("{{total}}", "8"))).toBeVisible();

  await o.page.goto(`/quiz/${BASKETBALL.id}:art2?count=12`);
  await playQuiz(o.page);

  // The exam canister passes each answer's time on to ranking's badge counters.
  const ranking = await canister("ranking", identityFromHex(o.seed));
  await expect.poll(async () => Number(((await ranking.getSkillCounters()) as { bestSpeedStreak: bigint }).bestSpeedStreak), { timeout: 60_000 }).toBeGreaterThanOrEqual(10);
  await navTab(o.page, "me").click();
  await o.page.reload();
  const badge = o.page.getByLabel(`${en.badges.speedDemon.name}: ${en.badges.speedDemon.description}`);
  await expect(badge).toHaveCSS("opacity", "1", { timeout: 30_000 });
  await expect(o.page.getByText(en.badges.earnedCount.replace("{{earned}}", "1").replace("{{total}}", "8"))).toBeVisible();
});
