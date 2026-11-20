/**
 * Whether an article belongs at a level. An article with no level is for
 * every level of its sport (an NCAA rule book covers them all), as the
 * content canister's listArticles has it.
 */
export function forLevel(article: { levelId: string }, levelId: string): boolean {
  return article.levelId === "" || article.levelId === levelId;
}
