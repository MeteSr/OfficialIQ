import Map "mo:core/Map";
import List "mo:core/List";
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

  public type DiagramPlayer = {
    id         : Text;
    x          : Nat; // percentage across the court width, 0-100
    y          : Nat; // percentage from the baseline toward half-court, 0-100
    shortLabel : Text; // short on-court label, e.g. "O1", "D1"
    role       : Text; // shown in the tap tooltip, e.g. "Defender — established legal position"
  };

  public type DiagramArrow = {
    fromId : Text; // a DiagramPlayer.id
    toId   : Text; // a DiagramPlayer.id
    style  : Text; // e.g. "solid", "dashed" — rendering hint for the frontend
  };

  public type CourtDiagram = {
    players : [DiagramPlayer];
    arrows  : [DiagramArrow];
  };

  public type CasebookPlay = {
    id        : Text;
    articleId : ArticleId;
    citation  : Text;
    scenario  : Text;
    ruling    : Text;
    audioUrl  : ?Text;
    diagram   : ?CourtDiagram;
    // Points at a hosted clip (Cloudflare R2 or similar CDN in production;
    // a same-origin asset path also works, e.g. "/clips/foo.mp4") — unlike
    // audio, video isn't stored on-chain as a Blob, just referenced by URL.
    videoUrl  : ?Text;
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
    diagram   : ?CourtDiagram;
  };

  public type PoeId = Text;

  public type PointOfEmphasis = {
    id               : PoeId;
    season           : Text;
    title            : Text;
    body             : Text;
    linkedArticleIds : [Text];
    audioUrl         : ?Text;
    createdAt        : Int;
  };

  public type PoeInput = {
    season           : Text;
    title            : Text;
    body             : Text;
    linkedArticleIds : [Text];
  };

  // Sport registry (issue #23) — the rest of the platform is already keyed
  // by sportId/levelId everywhere, so adding a sport is meant to be a pure
  // content-seeding operation (one upsertSport call plus the usual
  // upsertArticle/addQuestion seeding), not a code change.
  public type SportLevel = { id : Text; displayName : Text };

  public type Sport = {
    id           : Text;
    displayName  : Text;
    levels       : [SportLevel];
    rulebookYear : Text;
  };

  public type SportInput = {
    id           : Text;
    displayName  : Text;
    levels       : [SportLevel];
    rulebookYear : Text;
  };

  // Tap-to-assign coverage zone for the mechanics "coverage zone" quiz
  // type — a rectangular region on the CourtDiagram grid (same 0-100
  // percentage coordinate system as DiagramPlayer) with the crew role that
  // correctly has primary responsibility for it.
  public type MechanicsZone = {
    id              : Text;
    x               : Nat;
    y               : Nat;
    width           : Nat;
    height          : Nat;
    correctOfficial : Text; // e.g. "Trail", "Lead", "Center"
  };

  public type MechanicsScenario = {
    id          : Text;
    crewSize    : Nat; // 2 or 3
    title       : Text;
    description : Text;
    players     : [DiagramPlayer];
    zones       : [MechanicsZone];
    createdAt   : Int;
  };

  public type ScenarioInput = {
    crewSize    : Nat;
    title       : Text;
    description : Text;
    players     : [DiagramPlayer];
    zones       : [MechanicsZone];
  };

  // ── Community video submissions (issue #21, phase 3b) ────────────────────

  public type SubmissionStatus = { #Pending; #Approved; #Rejected };

  public type VideoSubmission = {
    id           : Text;
    submitter    : Principal;
    citation     : Text; // article/casebook citation the clip is meant to illustrate
    clipUrl      : Text;
    status       : SubmissionStatus;
    linkedPlayId : ?Text; // set once approved and linked to a specific play
    createdAt    : Int;
    reviewedAt   : ?Int;
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

  var poes : Map.Map<PoeId, PointOfEmphasis> = Map.empty<PoeId, PointOfEmphasis>();

  var scenarios : Map.Map<Text, MechanicsScenario> = Map.empty<Text, MechanicsScenario>();

  var submissions : Map.Map<Text, VideoSubmission> = Map.empty<Text, VideoSubmission>();

  var sports : Map.Map<Text, Sport> = Map.empty<Text, Sport>();

  var nextPlayId : Nat = 0;
  var nextPoeId : Nat = 0;
  var nextScenarioId : Nat = 0;
  var nextSubmissionId : Nat = 0;
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

  public shared query ({ caller }) func isAdminCaller() : async Bool {
    isAdmin(caller)
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

  public shared ({ caller }) func upsertSport(input : SportInput) : async Result.Result<Sport, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let s : Sport = {
      id = input.id; displayName = input.displayName;
      levels = input.levels; rulebookYear = input.rulebookYear;
    };
    Map.add(sports, Text.compare, input.id, s);
    #ok(s)
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
      diagram   = input.diagram;
      videoUrl  = null;
    };
    Map.add(plays, Text.compare, id, play);
    #ok(play)
  };

  public shared ({ caller }) func setPlayVideo(id : Text, url : Text) : async Result.Result<CasebookPlay, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(plays, Text.compare, id)) {
      case null #err("Play not found");
      case (?p) {
        let updated = { p with videoUrl = ?url };
        Map.add(plays, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared ({ caller }) func submitVideoClip(citation : Text, clipUrl : Text) : async Result.Result<VideoSubmission, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id = "vs" # Nat.toText(nextSubmissionId);
    nextSubmissionId += 1;
    let s : VideoSubmission = {
      id; submitter = caller; citation; clipUrl;
      status = #Pending; linkedPlayId = null; createdAt = Time.now(); reviewedAt = null;
    };
    Map.add(submissions, Text.compare, id, s);
    #ok(s)
  };

  public shared ({ caller }) func approveSubmission(id : Text, playId : Text) : async Result.Result<VideoSubmission, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(submissions, Text.compare, id)) {
      case null #err("Submission not found");
      case (?s) {
        switch (Map.get(plays, Text.compare, playId)) {
          case null #err("Target play not found");
          case (?p) {
            Map.add(plays, Text.compare, playId, { p with videoUrl = ?s.clipUrl });
            let updated = { s with status = #Approved; linkedPlayId = ?playId; reviewedAt = ?Time.now() };
            Map.add(submissions, Text.compare, id, updated);
            #ok(updated)
          };
        }
      };
    }
  };

  public shared ({ caller }) func rejectSubmission(id : Text) : async Result.Result<VideoSubmission, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(submissions, Text.compare, id)) {
      case null #err("Submission not found");
      case (?s) {
        let updated = { s with status = #Rejected; reviewedAt = ?Time.now() };
        Map.add(submissions, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared ({ caller }) func upsertPointOfEmphasis(input : PoeInput) : async Result.Result<PointOfEmphasis, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "poe" # Nat.toText(nextPoeId);
    nextPoeId += 1;
    let poe : PointOfEmphasis = {
      id               = id;
      season           = input.season;
      title            = input.title;
      body             = input.body;
      linkedArticleIds = input.linkedArticleIds;
      audioUrl         = null;
      createdAt        = Time.now();
    };
    Map.add(poes, Text.compare, id, poe);
    #ok(poe)
  };

  public shared ({ caller }) func upsertMechanicsScenario(input : ScenarioInput) : async Result.Result<MechanicsScenario, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "msc" # Nat.toText(nextScenarioId);
    nextScenarioId += 1;
    let s : MechanicsScenario = {
      id; crewSize = input.crewSize; title = input.title; description = input.description;
      players = input.players; zones = input.zones; createdAt = Time.now();
    };
    Map.add(scenarios, Text.compare, id, s);
    #ok(s)
  };

  // Reuses the same on-chain audioStore as article audio — keyed generically
  // by id, so a POE's audio lives alongside article audio with no separate store.
  public shared ({ caller }) func setPoeAudio(id : PoeId, audio : Blob) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(poes, Text.compare, id)) {
      case null { #err("Point of emphasis not found") };
      case (?p) {
        Map.add(audioStore, Text.compare, id, audio);
        Map.add(poes, Text.compare, id, {
          id = p.id; season = p.season; title = p.title; body = p.body;
          linkedArticleIds = p.linkedArticleIds; audioUrl = ?id; createdAt = p.createdAt;
        });
        #ok(())
      };
    }
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

  public query func listPointsOfEmphasis(season : Text) : async [PointOfEmphasis] {
    let buf = VarArray.repeat<PointOfEmphasis>({
      id = ""; season = ""; title = ""; body = ""; linkedArticleIds = []; audioUrl = null; createdAt = 0;
    }, Map.size(poes));
    var i = 0;
    for ((_, p) in Map.entries(poes)) {
      if (p.season == season) { buf[i] := p; i += 1 };
    };
    VarArray.sliceToArray<PointOfEmphasis>(buf, 0, i)
  };

  public query func listSports() : async [Sport] {
    let buf = VarArray.repeat<Sport>({ id = ""; displayName = ""; levels = []; rulebookYear = "" }, Map.size(sports));
    var i = 0;
    for ((_, s) in Map.entries(sports)) { buf[i] := s; i += 1 };
    VarArray.sliceToArray<Sport>(buf, 0, i)
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
      id = ""; articleId = ""; citation = ""; scenario = ""; ruling = ""; audioUrl = null; diagram = null; videoUrl = null;
    }, Map.size(plays));
    var i = 0;
    for ((_, p) in Map.entries(plays)) {
      if (p.articleId == articleId) { buf[i] := p; i += 1 };
    };
    VarArray.sliceToArray<CasebookPlay>(buf, 0, i)
  };

  public query func listMechanicsScenarios() : async [MechanicsScenario] {
    let buf = VarArray.repeat<MechanicsScenario>({
      id = ""; crewSize = 0; title = ""; description = ""; players = []; zones = []; createdAt = 0;
    }, Map.size(scenarios));
    var i = 0;
    for ((_, s) in Map.entries(scenarios)) { buf[i] := s; i += 1 };
    VarArray.sliceToArray<MechanicsScenario>(buf, 0, i)
  };

  public query func getMechanicsScenario(id : Text) : async ?MechanicsScenario {
    Map.get(scenarios, Text.compare, id)
  };

  public shared query ({ caller }) func getMySubmissions() : async [VideoSubmission] {
    let buf = List.empty<VideoSubmission>();
    for ((_, s) in Map.entries(submissions)) {
      if (s.submitter == caller) List.add(buf, s);
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func listPendingSubmissions() : async Result.Result<[VideoSubmission], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let buf = List.empty<VideoSubmission>();
    for ((_, s) in Map.entries(submissions)) {
      if (s.status == #Pending) List.add(buf, s);
    };
    #ok(List.toArray(buf))
  };

  public query func metrics() : async { articleCount : Nat; playCount : Nat } {
    { articleCount = Map.size(articles); playCount = Map.size(plays) }
  };
}
