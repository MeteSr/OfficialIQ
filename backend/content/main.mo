import HashMap "mo:base/HashMap";  // mo:core/Map migration pending
import Text "mo:core/Text";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Iter "mo:core/Iter";

persistent actor Content {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ArticleId = Text;

  public type Article = {
    id        : ArticleId;
    sportId   : Text;
    levelId   : Text;
    number    : Nat;
    title     : Text;
    body      : Text;
    audioUrl  : ?Text;
    createdAt : Int;
    updatedAt : Int;
  };

  public type CasebookPlay = {
    id        : Text;
    articleId : ArticleId;
    citation  : Text;
    scenario  : Text;
    ruling    : Text;
    audioUrl  : ?Text;
  };

  public type ArticleInput = {
    sportId : Text;
    levelId : Text;
    number  : Nat;
    title   : Text;
    body    : Text;
  };

  public type PlayInput = {
    articleId : ArticleId;
    citation  : Text;
    scenario  : Text;
    ruling    : Text;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var articles : HashMap.HashMap<ArticleId, Article> =
    HashMap.HashMap<ArticleId, Article>(256, Text.equal, Text.hash);

  var plays : HashMap.HashMap<Text, CasebookPlay> =
    HashMap.HashMap<Text, CasebookPlay>(512, Text.equal, Text.hash);

  var nextPlayId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin guards ─────────────────────────────────────────────────────────

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

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func upsertArticle(input : ArticleInput) : async Result.Result<Article, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id  = input.sportId # ":art" # Nat.toText(input.number);
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

  public shared ({ caller }) func upsertPlay(input : PlayInput) : async Result.Result<CasebookPlay, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id  = "p" # Nat.toText(nextPlayId);
    nextPlayId += 1;
    let play : CasebookPlay = {
      id        = id;
      articleId = input.articleId;
      citation  = input.citation;
      scenario  = input.scenario;
      ruling    = input.ruling;
      audioUrl  = null;
    };
    plays.put(id, play);
    #ok(play)
  };

  public shared ({ caller }) func setArticleAudio(id : ArticleId, url : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (articles.get(id)) {
      case null { #err("Article not found") };
      case (?a) {
        articles.put(id, {
          id        = a.id;
          sportId   = a.sportId;
          levelId   = a.levelId;
          number    = a.number;
          title     = a.title;
          body      = a.body;
          audioUrl  = ?url;
          createdAt = a.createdAt;
          updatedAt = Time.now();
        });
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getArticle(id : ArticleId) : async ?Article {
    articles.get(id)
  };

  public query func listArticles(sportId : Text, levelId : Text) : async [Article] {
    let buf = Array.init<Article>(articles.size(), {
      id = ""; sportId = ""; levelId = ""; number = 0; title = ""; body = "";
      audioUrl = null; createdAt = 0; updatedAt = 0;
    });
    var i = 0;
    for ((_, art) in articles.entries()) {
      if (art.sportId == sportId and art.levelId == levelId) {
        buf[i] := art;
        i += 1;
      };
    };
    Array.tabulate<Article>(i, func(j) { buf[j] })
  };

  public query func listPlays(articleId : ArticleId) : async [CasebookPlay] {
    let buf = Array.init<CasebookPlay>(plays.size(), {
      id = ""; articleId = ""; citation = ""; scenario = ""; ruling = ""; audioUrl = null;
    });
    var i = 0;
    for ((_, p) in plays.entries()) {
      if (p.articleId == articleId) { buf[i] := p; i += 1 };
    };
    Array.tabulate<CasebookPlay>(i, func(j) { buf[j] })
  };

  public query func metrics() : async { articleCount : Nat; playCount : Nat } {
    { articleCount = articles.size(); playCount = plays.size() }
  };
}
