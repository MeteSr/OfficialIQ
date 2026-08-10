import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

persistent actor Content {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ArticleId = Text;  // e.g. "ncaa_basketball:art4"

  public type Article = {
    id         : ArticleId;
    sportId    : Text;   // "ncaa_basketball"
    levelId    : Text;   // "varsity"
    number     : Nat;    // 4
    title      : Text;   // "Fouls"
    body       : Text;   // full rule text (Markdown)
    audioUrl   : ?Text;  // Cloudflare R2 presigned URL (populated by ai_proxy)
    createdAt  : Int;
    updatedAt  : Int;
  };

  public type CasebookPlay = {
    id         : Text;
    articleId  : ArticleId;
    citation   : Text;   // "Art. 4-23, pg. 42"
    scenario   : Text;
    ruling     : Text;
    audioUrl   : ?Text;
  };

  public type ArticleInput = {
    sportId  : Text;
    levelId  : Text;
    number   : Nat;
    title    : Text;
    body     : Text;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var articles : HashMap.HashMap<ArticleId, Article> =
    HashMap.HashMap<ArticleId, Article>(256, Text.equal, Text.hash);

  var plays : HashMap.HashMap<Text, CasebookPlay> =
    HashMap.HashMap<Text, CasebookPlay>(512, Text.equal, Text.hash);

  // admin principal set on first deploy via setAdmin
  var adminPrincipal : ?Principal = null;

  // ─── Admin ────────────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) {
        if (caller == a) { adminPrincipal := ?p; #ok(()) }
        else #err("Unauthorized")
      };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  public shared ({ caller }) func upsertArticle(input : ArticleInput) : async Result.Result<Article, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = input.sportId # ":" # "art" # Nat.toText(input.number);
    let now = Time.now();
    let existing = articles.get(id);
    let art : Article = {
      id        = id;
      sportId   = input.sportId;
      levelId   = input.levelId;
      number    = input.number;
      title     = input.title;
      body      = input.body;
      audioUrl  = switch existing { case (?e) e.audioUrl; case null null };
      createdAt = switch existing { case (?e) e.createdAt; case null now };
      updatedAt = now;
    };
    articles.put(id, art);
    #ok(art)
  };

  public shared ({ caller }) func setArticleAudio(id : ArticleId, url : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (articles.get(id)) {
      case null { #err("Article not found") };
      case (?a) {
        articles.put(id, { a with audioUrl = ?url; updatedAt = Time.now() });
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getArticle(id : ArticleId) : async ?Article {
    articles.get(id)
  };

  public query func listArticles(sportId : Text, levelId : Text) : async [Article] {
    let out = Array.init<Article>(articles.size(), {
      id = ""; sportId = ""; levelId = ""; number = 0; title = ""; body = "";
      audioUrl = null; createdAt = 0; updatedAt = 0;
    });
    var i = 0;
    for ((_, art) in articles.entries()) {
      if (art.sportId == sportId and art.levelId == levelId) {
        out[i] := art;
        i += 1;
      };
    };
    Array.tabulate<Article>(i, func(j) { out[j] })
  };

  public query func listPlays(articleId : ArticleId) : async [CasebookPlay] {
    let out = Array.init<CasebookPlay>(plays.size(), {
      id = ""; articleId = ""; citation = ""; scenario = ""; ruling = ""; audioUrl = null;
    });
    var i = 0;
    for ((_, p) in plays.entries()) {
      if (p.articleId == articleId) { out[i] := p; i += 1 };
    };
    Array.tabulate<CasebookPlay>(i, func(j) { out[j] })
  };

  public query func metrics() : async { articleCount : Nat; playCount : Nat } {
    { articleCount = articles.size(); playCount = plays.size() }
  };
}
