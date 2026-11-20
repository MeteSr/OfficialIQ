import { beforeEach, describe, expect, it, vi } from "vitest";

const createShareLink = vi.fn();
const getByShareToken = vi.fn();
const createCrew = vi.fn();
const listPointsOfEmphasis = vi.fn(async (..._a: unknown[]) => [{ linkedArticleIds: ["s:art2"] }]);
vi.mock("../services/exam", () => ({ examService: { createShareLink: (...a: unknown[]) => createShareLink(...a), getByShareToken: (...a: unknown[]) => getByShareToken(...a) } }));
vi.mock("../services/challenge", () => ({ challengeService: { createCrew: (...a: unknown[]) => createCrew(...a) } }));
vi.mock("../services/content", () => ({
  contentService: {
    listArticles: async () => [{ id: "s:art1", title: "Art 1" }, { id: "s:art2", title: "Art 2" }],
    listPointsOfEmphasis: (...a: unknown[]) => listPointsOfEmphasis(...a),
  },
}));

import { createCrewForGame, crewForGame } from "./crew";
import { currentSeason } from "./ruleChanges";

const game = { opponent: "Central vs North", gameDateMs: 1_800_000_000_000, sportId: "s", levelId: "varsity" };

describe("createCrewForGame", () => {
  beforeEach(() => { createShareLink.mockReset(); getByShareToken.mockReset(); createCrew.mockReset(); });

  it("builds the crew on the questions the exam canister picked for a share link", async () => {
    createShareLink.mockResolvedValue("eqtoken");
    getByShareToken.mockResolvedValue({ questionIds: ["q1", "q2"] });
    createCrew.mockImplementation(async (input) => ({ id: "crew0", ...input }));

    await createCrewForGame(game);
    // The game's sport's points of emphasis, this season.
    expect(listPointsOfEmphasis).toHaveBeenCalledWith("s", currentSeason(Date.now()));

    const [config, picks] = createShareLink.mock.calls[0];
    expect(config).toMatchObject({ sportId: "s", mode: { ShareLink: null }, count: 6n });
    // Plays come from this season's emphasis article at the level.
    expect(picks[1]).toMatchObject({ casebook: true, articleIds: ["s:art2"] });
    expect(getByShareToken).toHaveBeenCalledWith("eqtoken");
    expect(createCrew).toHaveBeenCalledWith({
      gameLabel: "Central vs North", gameDateMs: game.gameDateMs, sportId: "s", levelId: "varsity", questionIds: ["q1", "q2"],
    });
  });

  it("doesn't open an empty crew", async () => {
    createShareLink.mockResolvedValue("eqtoken");
    getByShareToken.mockResolvedValue({ questionIds: [] });
    await expect(createCrewForGame(game)).rejects.toThrow(/No questions/);
    expect(createCrew).not.toHaveBeenCalled();
  });
});

describe("crewForGame", () => {
  const crew = { id: "crew0", gameLabel: "Central vs North", gameDate: 5n } as any;
  it("finds the crew opened for the same game and time", () => {
    expect(crewForGame([crew], { opponent: " Central vs North ", gameDate: 5n })).toBe(crew);
  });
  it("doesn't match another game or another time", () => {
    expect(crewForGame([crew], { opponent: "Central vs North", gameDate: 6n })).toBeUndefined();
    expect(crewForGame([crew], { opponent: "East vs West", gameDate: 5n })).toBeUndefined();
  });
});
