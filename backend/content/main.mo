import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
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

  var articles : Map.Map<ArticleId, Article> = Map.empty<ArticleId, Article>();

  var plays : Map.Map<Text, CasebookPlay> = Map.empty<Text, CasebookPlay>();

  // Audio bytes are stored separately from the Article record (not inline
  // in `articles`) so bulk queries like listArticles() stay cheap — an
  // article's `audioUrl` field is repurposed as a lightweight "has audio"
  // marker (set to the article id itself) rather than a real fetchable URL,
  // since audio is served on-chain via getArticleAudio(), not a CDN.
  var audioStore : Map.Map<Text, Blob> = Map.empty<Text, Blob>();

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
    let existing = Map.get(articles, Text.compare, id);
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
    Map.add(articles, Text.compare, id, art);
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
    Map.add(plays, Text.compare, id, play);
    #ok(play)
  };

  public shared ({ caller }) func setArticleAudio(id : ArticleId, audio : Blob) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(articles, Text.compare, id)) {
      case null { #err("Article not found") };
      case (?a) {
        Map.add(audioStore, Text.compare, id, audio);
        Map.add(articles, Text.compare, id, {
          id        = a.id;
          sportId   = a.sportId;
          levelId   = a.levelId;
          number    = a.number;
          title     = a.title;
          body      = a.body;
          audioUrl  = ?id;
          createdAt = a.createdAt;
          updatedAt = Time.now();
        });
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getArticle(id : ArticleId) : async ?Article {
    Map.get(articles, Text.compare, id)
  };

  public query func getArticleAudio(id : ArticleId) : async ?Blob {
    Map.get(audioStore, Text.compare, id)
  };

  public query func listArticles(sportId : Text, levelId : Text) : async [Article] {
    let buf = VarArray.repeat<Article>({
      id = ""; sportId = ""; levelId = ""; number = 0; title = ""; body = "";
      audioUrl = null; createdAt = 0; updatedAt = 0;
    }, Map.size(articles));
    var i = 0;
    for ((_, art) in Map.entries(articles)) {
      if (art.sportId == sportId and art.levelId == levelId) {
        buf[i] := art;
        i += 1;
      };
    };
    VarArray.sliceToArray<Article>(buf, 0, i)
  };

  public query func listPlays(articleId : ArticleId) : async [CasebookPlay] {
    let buf = VarArray.repeat<CasebookPlay>({
      id = ""; articleId = ""; citation = ""; scenario = ""; ruling = ""; audioUrl = null;
    }, Map.size(plays));
    var i = 0;
    for ((_, p) in Map.entries(plays)) {
      if (p.articleId == articleId) { buf[i] := p; i += 1 };
    };
    VarArray.sliceToArray<CasebookPlay>(buf, 0, i)
  };

  public query func metrics() : async { articleCount : Nat; playCount : Nat } {
    { articleCount = Map.size(articles); playCount = Map.size(plays) }
  };
}
