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
import Set "mo:core/Set";
import Env "../lib/Env";
import Clips "../lib/Clips";
import Error "mo:core/Error";
import Call "mo:ic/Call";

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
    language  : Text; // ISO 639-1, e.g. "en", "es" — issue #27
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
    sportId  : Text;
    levelId  : Text;
    number   : Nat;
    title    : Text;
    body     : Text;
    language : Text;
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

  // The sport each point of emphasis belongs to, for those imported with
  // one (replacePointsOfEmphasis). Kept beside `poes` so the stored record
  // doesn't change.
  var poeSport : Map.Map<PoeId, Text> = Map.empty<PoeId, Text>();

  var nextPlayId : Nat = 0;
  var nextPoeId : Nat = 0;
  var nextScenarioId : Nat = 0;
  var nextSubmissionId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin guards ─────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null {
        // Bootstrap is controller-only, so nobody can claim admin on a freshly
        // deployed canister before its deployer does (canister-security skill).
        if (not Principal.isController(caller)) return #err("Only a canister controller can set the first admin");
        adminPrincipal := ?p;
        #ok(())
      };
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

  // English keeps the original bare "sportId:artN" id — every other
  // canister/page in this app treats that as the stable articleId (quiz
  // history, exam configs, association assignments, mechanics pseudo-ids),
  // so changing it for the default language would be a breaking migration.
  // Non-English translations of the same article get a suffixed id instead,
  // as a genuinely separate Article record.
  public shared ({ caller }) func upsertArticle(input : ArticleInput) : async Result.Result<Article, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let baseId = input.sportId # ":art" # Nat.toText(input.number);
    let id = if (input.language == "en" or input.language == "") baseId else baseId # ":" # input.language;
    let now = Time.now();
    let existing = Map.get(articles, Text.compare, id);
    let art : Article = {
      id        = id;
      sportId   = input.sportId;
      levelId   = input.levelId;
      number    = input.number;
      title     = input.title;
      body      = input.body;
      language  = if (input.language == "") "en" else input.language;
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

  /// How an import changed a set: records added, replaced in place, removed.
  public type ImportResult = { added : Nat; updated : Nat; removed : Nat };

  /// Replaces an article's approved rulings with `items` (a rulebook
  /// import). A play whose citation is in `items` keeps its id, audio and
  /// video and takes the new wording; the article's other plays are
  /// removed. Running the same import twice changes nothing. Admin only.
  public shared ({ caller }) func replacePlays(articleId : ArticleId, items : [PlayInput]) : async Result.Result<ImportResult, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    for (i in items.values()) {
      if (i.articleId != articleId) return #err("articleId: every play must be for " # articleId);
    };
    let byCitation = Map.empty<Text, CasebookPlay>();
    for ((_, p) in Map.entries(plays)) {
      if (p.articleId == articleId) Map.add(byCitation, Text.compare, p.citation, p);
    };
    var added = 0;
    var updated = 0;
    let keep = Set.empty<Text>();
    for (i in items.values()) {
      switch (Map.get(byCitation, Text.compare, i.citation)) {
        case (?old) {
          Map.add(plays, Text.compare, old.id, { old with scenario = i.scenario; ruling = i.ruling; diagram = i.diagram });
          Set.add(keep, Text.compare, old.id);
          updated += 1;
        };
        case null {
          let id = "p" # Nat.toText(nextPlayId);
          nextPlayId += 1;
          Map.add(plays, Text.compare, id, {
            id; articleId; citation = i.citation; scenario = i.scenario; ruling = i.ruling;
            audioUrl = null; diagram = i.diagram; videoUrl = null;
          });
          Map.add(byCitation, Text.compare, i.citation, { id; articleId; citation = i.citation; scenario = i.scenario; ruling = i.ruling; audioUrl = null; diagram = i.diagram; videoUrl = null });
          Set.add(keep, Text.compare, id);
          added += 1;
        };
      };
    };
    var removed = 0;
    for ((_, p) in Map.entries(byCitation)) {
      if (not Set.contains(keep, Text.compare, p.id)) { Map.remove(plays, Text.compare, p.id); removed += 1 };
    };
    #ok({ added; updated; removed })
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

  /// Called by the user canister when an official deletes their account:
  /// deletes their clip submissions that weren't used. An approved clip is
  /// already part of a casebook play, so it stays, with the submitter
  /// replaced by the anonymous principal. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    // Their clips: approved ones stay without their name (as approved video
    // submissions do); the rest, and unfinished uploads, go.
    let theirClips = List.empty<Clips.Clip>();
    for ((_, c) in Map.entries(clips)) { if (c.uploader == p) List.add(theirClips, c) };
    for (c in List.values(theirClips)) {
      if (c.status == #approved) Map.add(clips, Text.compare, c.id, { c with uploader = Principal.anonymous() })
      else Map.remove(clips, Text.compare, c.id);
    };
    let theirUploads = List.empty<Text>();
    for ((uid, u) in Map.entries(clipUploads)) { if (u.uploader == p) List.add(theirUploads, uid) };
    for (uid in List.values(theirUploads)) Map.remove(clipUploads, Text.compare, uid);
    let theirs = List.empty<VideoSubmission>();
    for ((_, s) in Map.entries(submissions)) { if (s.submitter == p) List.add(theirs, s) };
    for (s in List.values(theirs)) {
      switch (s.status) {
        case (#Approved) Map.add(submissions, Text.compare, s.id, { s with submitter = Principal.anonymous() });
        case _ Map.remove(submissions, Text.compare, s.id);
      };
    };
    #ok(())
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

  /// Replaces a sport's points of emphasis for a season with `items` (a
  /// rulebook import), matching by title: a match keeps its id and audio
  /// and takes the new wording; the sport's others for the season are
  /// removed. Admin only.
  public shared ({ caller }) func replacePointsOfEmphasis(sportId : Text, season : Text, items : [PoeInput]) : async Result.Result<ImportResult, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    for (i in items.values()) {
      if (i.season != season) return #err("season: every point must be for " # season);
    };
    let byTitle = Map.empty<Text, PointOfEmphasis>();
    for ((id, p) in Map.entries(poes)) {
      if (p.season == season and Map.get(poeSport, Text.compare, id) == ?sportId) Map.add(byTitle, Text.compare, p.title, p);
    };
    var added = 0;
    var updated = 0;
    let keep = Set.empty<Text>();
    for (i in items.values()) {
      switch (Map.get(byTitle, Text.compare, i.title)) {
        case (?old) {
          Map.add(poes, Text.compare, old.id, { old with body = i.body; linkedArticleIds = i.linkedArticleIds });
          Set.add(keep, Text.compare, old.id);
          updated += 1;
        };
        case null {
          let id = "poe" # Nat.toText(nextPoeId);
          nextPoeId += 1;
          let poe : PointOfEmphasis = {
            id; season; title = i.title; body = i.body; linkedArticleIds = i.linkedArticleIds;
            audioUrl = null; createdAt = Time.now();
          };
          Map.add(poes, Text.compare, id, poe);
          Map.add(poeSport, Text.compare, id, sportId);
          Map.add(byTitle, Text.compare, i.title, poe);
          Set.add(keep, Text.compare, id);
          added += 1;
        };
      };
    };
    var removed = 0;
    for ((_, p) in Map.entries(byTitle)) {
      if (not Set.contains(keep, Text.compare, p.id)) {
        Map.remove(poes, Text.compare, p.id);
        Map.remove(poeSport, Text.compare, p.id);
        removed += 1;
      };
    };
    #ok({ added; updated; removed })
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
          language  = a.language;
          audioUrl  = ?id;
          createdAt = a.createdAt;
          updatedAt = Time.now();
        });
        #ok(())
      };
    }
  };

  // ─── Rule changes (issue #68) ──────────────────────────────────────────────
  //
  // "What changed this season": each change to a rule, keyed by sport and
  // season, with the old and new wording and the article it's in. A sibling
  // of the points of emphasis above. The wording must come from the licensed
  // rulebook edition named in `source` (#50), so only admins write it.
  // oldText is empty for a rule that's new this season.

  public type RuleChange = {
    id        : Text;
    sportId   : Text;
    season    : Text;
    articleId : Text;
    citation  : Text;
    title     : Text;
    oldText   : Text;
    newText   : Text;
    summary   : Text;
    source    : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  public type RuleChangeInput = {
    sportId   : Text;
    season    : Text;
    articleId : Text;
    citation  : Text;
    title     : Text;
    oldText   : Text;
    newText   : Text;
    summary   : Text;
    source    : Text;
  };

  public type RuleChangeError = { #notAdmin; #notFound; #invalid : Text };

  let ruleChanges : Map.Map<Text, RuleChange> = Map.empty<Text, RuleChange>();
  var nextRuleChangeId : Nat = 0;
  transient let MAX_RULE_TEXT_CHARS : Nat = 20_000;

  func blank(t : Text) : Bool = t.trim(#char ' ').size() == 0;

  func invalidRuleChange(i : RuleChangeInput) : ?Text {
    if (blank(i.sportId)) return ?"sportId";
    if (blank(i.season)) return ?"season";
    if (blank(i.articleId)) return ?"articleId";
    if (blank(i.title)) return ?"title";
    if (blank(i.newText)) return ?"newText";
    for ((name, t) in [("title", i.title), ("oldText", i.oldText), ("newText", i.newText), ("summary", i.summary), ("source", i.source), ("citation", i.citation)].values()) {
      if (t.size() > MAX_RULE_TEXT_CHARS) return ?name;
    };
    null
  };

  /// Adds a change (id null) or replaces the one with `id`. Admin only.
  public shared ({ caller }) func upsertRuleChange(id : ?Text, input : RuleChangeInput) : async Result.Result<RuleChange, RuleChangeError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    switch (invalidRuleChange(input)) { case (?field) return #err(#invalid(field)); case null {} };
    let now = Time.now();
    let (rid, createdAt) = switch id {
      case null { let n = nextRuleChangeId; nextRuleChangeId += 1; ("rc" # n.toText(), now) };
      case (?existing) {
        switch (ruleChanges.get(Text.compare, existing)) {
          case (?old) (existing, old.createdAt);
          case null return #err(#notFound);
        }
      };
    };
    let c : RuleChange = { input with id = rid; createdAt; updatedAt = now };
    ruleChanges.add(Text.compare, rid, c);
    #ok(c)
  };

  public shared ({ caller }) func deleteRuleChange(id : Text) : async Result.Result<(), RuleChangeError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    switch (ruleChanges.take(Text.compare, id)) { case (?_) #ok(()); case null #err(#notFound) }
  };

  /// A sport's rule changes for a season (e.g. "2026-27"), oldest first.
  public query func listRuleChanges(sportId : Text, season : Text) : async [RuleChange] {
    let out = List.empty<RuleChange>();
    for (c in ruleChanges.values()) { if (c.sportId == sportId and c.season == season) out.add(c) };
    out.sortInPlace(func(a, b) = Int.compare(a.createdAt, b.createdAt));
    out.toArray()
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

  /// A sport's points of emphasis for a season, oldest first (those
  /// imported for it with replacePointsOfEmphasis).
  public query func listSportPointsOfEmphasis(sportId : Text, season : Text) : async [PointOfEmphasis] {
    let out = List.empty<PointOfEmphasis>();
    for ((id, p) in Map.entries(poes)) {
      if (p.season == season and Map.get(poeSport, Text.compare, id) == ?sportId) List.add(out, p);
    };
    List.sortInPlace(out, func(a : PointOfEmphasis, b : PointOfEmphasis) : { #less; #equal; #greater } = Int.compare(a.createdAt, b.createdAt));
    List.toArray(out)
  };

  public query func listSports() : async [Sport] {
    let buf = VarArray.repeat<Sport>({ id = ""; displayName = ""; levels = []; rulebookYear = "" }, Map.size(sports));
    var i = 0;
    for ((_, s) in Map.entries(sports)) { buf[i] := s; i += 1 };
    VarArray.sliceToArray<Sport>(buf, 0, i)
  };

  /// A sport's articles at a level, with those for every level (an empty
  /// levelId: a rule book that covers them all).
  public query func listArticles(sportId : Text, levelId : Text, language : Text) : async [Article] {
    let buf = VarArray.repeat<Article>({
      id = ""; sportId = ""; levelId = ""; number = 0; title = ""; body = ""; language = "";
      audioUrl = null; createdAt = 0; updatedAt = 0;
    }, Map.size(articles));
    var i = 0;
    for ((_, art) in Map.entries(articles)) {
      if (art.sportId == sportId and (art.levelId == levelId or art.levelId == "") and art.language == language) {
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

  /// The plays of several articles in one call (offline sync used to make
  /// one listPlays call per article).
  public query func listPlaysFor(articleIds : [ArticleId]) : async [CasebookPlay] {
    if (articleIds.size() > 500) return [];
    let wanted = Set.fromIter<Text>(articleIds.values(), Text.compare);
    let out = List.empty<CasebookPlay>();
    for ((_, p) in Map.entries(plays)) {
      if (Set.contains(wanted, Text.compare, p.articleId)) List.add(out, p);
    };
    List.toArray(out)
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

  // ─── Clip library ──────────────────────────────────────────────────────────
  // Game clips hosted on Cloudflare Stream (lib/Clips.mo has the rules and
  // the API formats). An official uploads a file straight to Cloudflare
  // with a one-time link from startClipUpload, then describes it with
  // createClip: the rule (and section or ruling) it shows, an optional
  // "you make the call" question at a point in the clip, who may see it
  // (everyone, or one association's members), and that they have the right
  // to share it. Admins review clips for everyone; an association's
  // coordinator reviews its clips. Clips only ever play through a signed
  // link that clipPlayback gives a viewer it has checked.

  type VideoConfig = { accountId : Text; customerCode : Text; apiToken : Text };
  var videoConfig : ?VideoConfig = null;
  var clips : Map.Map<Text, Clips.Clip> = Map.empty<Text, Clips.Clip>();
  var nextClipId : Nat = 0;
  // Uploads started but not yet described: Cloudflare video id → uploader.
  var clipUploads : Map.Map<Text, { uploader : Principal; startedAt : Int }> = Map.empty<Text, { uploader : Principal; startedAt : Int }>();
  // Signed playback tokens, reused while fresh (one outcall per clip per ~hour).
  transient let clipTokens : Map.Map<Text, { token : Text; mintedAt : Int }> = Map.empty<Text, { token : Text; mintedAt : Int }>();
  transient let MAX_UPLOADS_PER_DAY : Nat = 10;
  transient let DAY_NS : Int = 86_400_000_000_000;

  /// Stores the Cloudflare Stream account (scripts/set-video-config.mjs). Admin only.
  public shared ({ caller }) func setVideoConfig(accountId : Text, customerCode : Text, apiToken : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    if (blank(accountId) or blank(customerCode) or blank(apiToken)) return #err("All three values are needed");
    videoConfig := ?{ accountId; customerCode; apiToken };
    Map.clear(clipTokens);
    #ok(())
  };

  public query func videoConfigured() : async Bool { videoConfig != null };

  /// A Cloudflare Stream API call, made by one replica (each replica would
  /// otherwise create its own upload or token). The body on 200, else an error.
  func stream(method : { #get; #post; #delete }, path : Text, body : Text) : async Result.Result<Text, Text> {
    let cfg = switch videoConfig { case (?c) c; case null return #err("Video hosting isn't set up yet") };
    let req = Call.httpRequest(Clips.API # cfg.accountId # "/stream" # path)
      .withMethod(method)
      .withHeader("authorization", "Bearer " # cfg.apiToken)
      .withHeader("content-type", "application/json")
      .withMaxResponseBytes(20_000)
      .nonReplicated();
    let resp = try {
      await (if (body == "") req else req.withBody(Text.encodeUtf8(body))).send()
    } catch (e) { return #err("Couldn't reach the video host: " # Error.message(e)) };
    if (resp.status != 200) return #err("The video host refused the request (HTTP " # Nat.toText(resp.status) # ")");
    #ok(switch (Text.decodeUtf8(resp.body)) { case (?t) t; case null "" })
  };

  type AssociationView = actor { membershipOf : query (Text, Principal) -> async Clips.Membership; coordinatedBy : query Principal -> async [Text] };

  func association<system>() : ?AssociationView {
    switch (Env.canisterId<system>("association")) { case (?id) ?(actor (id.toText()) : AssociationView); case null null }
  };

  func membership<system>(c : Clips.Clip, p : Principal) : async* Clips.Membership {
    switch (c.visibility) {
      case (#everyone) #none;
      case (#association(a)) switch (association<system>()) {
        case (?assoc) try { await assoc.membershipOf(a, p) } catch (_) { #none };
        case null #none;
      };
    }
  };

  /// A one-time link to upload a clip's video straight to Cloudflare (a
  /// POST of the file as form field "file"). Signed-in officials, a few a day.
  public shared ({ caller }) func startClipUpload() : async Result.Result<{ uploadId : Text; uploadUrl : Text }, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to upload a clip");
    let since = Time.now() - DAY_NS;
    var today = 0;
    for ((_, u) in Map.entries(clipUploads)) { if (u.uploader == caller and u.startedAt > since) today += 1 };
    for ((_, c) in Map.entries(clips)) { if (c.uploader == caller and c.createdAt > since) today += 1 };
    if (today >= MAX_UPLOADS_PER_DAY) return #err("That's today's limit of clip uploads");
    switch (await stream(#post, "/direct_upload", Clips.directUploadBody(Clips.MAX_DURATION_SEC))) {
      case (#err(e)) #err(e);
      case (#ok(body)) switch (Clips.parseDirectUpload(body)) {
        case (?u) {
          Map.add(clipUploads, Text.compare, u.uid, { uploader = caller; startedAt = Time.now() });
          #ok({ uploadId = u.uid; uploadUrl = u.uploadUrl })
        };
        case null #err("The video host's reply wasn't understood");
      };
    }
  };

  /// Describes an uploaded clip, for review. The uploader must be a member
  /// of the association a clip is for.
  public shared ({ caller }) func createClip(input : Clips.ClipInput) : async Result.Result<Clips.Clip, Text> {
    switch (Clips.validate(input)) { case (?field) return #err("invalid: " # field); case null {} };
    switch (Map.get(clipUploads, Text.compare, input.uploadId)) {
      case (?u) { if (u.uploader != caller) return #err("That upload isn't yours") };
      case null return #err("Unknown upload: start one with startClipUpload");
    };
    if (Map.get(articles, Text.compare, input.articleId) == null) return #err("invalid: articleId");
    switch (input.playId) {
      case (?pid) switch (Map.get(plays, Text.compare, pid)) { case (?p) { if (p.articleId != input.articleId) return #err("invalid: playId") }; case null return #err("invalid: playId") };
      case null {};
    };
    let draft : Clips.Clip = {
      id = "clip" # Nat.toText(nextClipId); uploadId = input.uploadId; sportId = input.sportId; articleId = input.articleId;
      sectionKey = input.sectionKey; playId = input.playId; title = input.title; description = input.description;
      callAtSec = input.callAtSec; question = input.question; visibility = input.visibility; uploader = caller;
      rights = { statement = Clips.RIGHTS_STATEMENT; attestedAt = Time.now() }; status = #pending; createdAt = Time.now(); reviewedBy = null;
    };
    switch (input.visibility) {
      case (#association(_)) { if ((await* membership<system>(draft, caller)) == #none) return #err("Join the association to share clips with it") };
      case (#everyone) {};
    };
    nextClipId += 1;
    Map.remove(clipUploads, Text.compare, input.uploadId);
    Map.add(clips, Text.compare, draft.id, draft);
    #ok(draft)
  };

  /// Approves or rejects a clip. Approving needs the video to have finished
  /// processing, and turns on its MP4 rendition for playback.
  public shared ({ caller }) func reviewClip(id : Text, approve : Bool) : async Result.Result<Clips.Clip, Text> {
    let c = switch (Map.get(clips, Text.compare, id)) { case (?c) c; case null return #err("Not found") };
    if (not Clips.canReview(c, isAdmin(caller), await* membership<system>(c, caller))) return #err("Not a reviewer of this clip");
    if (approve) {
      switch (await stream(#get, "/" # c.uploadId, "")) {
        case (#err(e)) return #err(e);
        case (#ok(body)) { if (Clips.parseReady(body) != ?true) return #err("The video is still processing; try again in a minute") };
      };
      switch (await stream(#post, "/" # c.uploadId # "/downloads", "{}")) { case (#err(e)) return #err(e); case (#ok(_)) {} };
    };
    let reviewed = { c with status = if approve #approved else #rejected; reviewedBy = ?caller };
    Map.add(clips, Text.compare, id, reviewed);
    #ok(reviewed)
  };

  /// Approved clips for everyone on a rule (or a whole sport, with articleId
  /// null), with the caller's own clips waiting for review.
  public shared query ({ caller }) func listClips(sportId : Text, articleId : ?Text) : async [Clips.Clip] {
    let out = List.empty<Clips.Clip>();
    for ((_, c) in Map.entries(clips)) {
      let here = c.sportId == sportId and (switch articleId { case (?a) c.articleId == a; case null true });
      let visible = (c.status == #approved and c.visibility == #everyone) or (c.uploader == caller and c.status == #pending);
      if (here and visible) List.add(out, c);
    };
    List.toArray(out)
  };

  /// An association's clips, for its members: approved ones, and those
  /// waiting for review for its coordinator.
  public shared ({ caller }) func listAssociationClips(associationId : Text) : async Result.Result<[Clips.Clip], Text> {
    let assoc = switch (association<system>()) { case (?a) a; case null return #err("Associations aren't available") };
    let m = try { await assoc.membershipOf(associationId, caller) } catch (_) { return #err("Couldn't check membership, try again") };
    if (m == #none) return #err("Members only");
    let out = List.empty<Clips.Clip>();
    for ((_, c) in Map.entries(clips)) {
      if (c.visibility == #association(associationId) and Clips.canView(c, caller, m)) List.add(out, c);
    };
    #ok(List.toArray(out))
  };

  /// The clips the caller reviews that are waiting: for an admin, those for
  /// everyone; for a coordinator, their associations'.
  public shared ({ caller }) func listClipsToReview() : async [Clips.Clip] {
    let mine = switch (association<system>()) {
      case (?a) try { await a.coordinatedBy(caller) } catch (_) { [] };
      case null [];
    };
    let admin = isAdmin(caller);
    let out = List.empty<Clips.Clip>();
    for ((_, c) in Map.entries(clips)) {
      if (c.status == #pending) {
        let mineToReview = switch (c.visibility) {
          case (#everyone) admin;
          case (#association(a)) admin or Array.find<Text>(mine, func(x) { x == a }) != null;
        };
        if (mineToReview) List.add(out, c);
      };
    };
    List.toArray(out)
  };

  /// A clip and a signed MP4 link to play it, for a viewer who may see it.
  public shared ({ caller }) func clipPlayback(id : Text) : async Result.Result<{ url : Text; clip : Clips.Clip }, Text> {
    let c = switch (Map.get(clips, Text.compare, id)) { case (?c) c; case null return #err("Not found") };
    let cfg = switch videoConfig { case (?c) c; case null return #err("Video hosting isn't set up yet") };
    if (not Clips.canView(c, caller, await* membership<system>(c, caller)) and not isAdmin(caller)) return #err("Not allowed to watch this clip");
    let now = Time.now();
    let token = switch (Map.get(clipTokens, Text.compare, c.uploadId)) {
      case (?t) { if (Clips.tokenFresh(t.mintedAt, now)) ?t.token else null };
      case null null;
    };
    let t = switch token {
      case (?t) t;
      case null switch (await stream(#post, "/" # c.uploadId # "/token", "{}")) {
        case (#err(e)) return #err(e);
        case (#ok(body)) switch (Clips.parseToken(body)) {
          case (?t) { Map.add(clipTokens, Text.compare, c.uploadId, { token = t; mintedAt = now }); t };
          case null return #err("The video host's reply wasn't understood");
        };
      };
    };
    #ok({ url = Clips.mp4Url(cfg.customerCode, t); clip = c })
  };

  /// Removes a clip (its uploader or a reviewer), and its video.
  public shared ({ caller }) func deleteClip(id : Text) : async Result.Result<(), Text> {
    let c = switch (Map.get(clips, Text.compare, id)) { case (?c) c; case null return #err("Not found") };
    if (c.uploader != caller and not Clips.canReview(c, isAdmin(caller), await* membership<system>(c, caller))) return #err("Not allowed");
    Map.remove(clips, Text.compare, id);
    Map.remove(clipTokens, Text.compare, c.uploadId);
    ignore await stream(#delete, "/" # c.uploadId, "");
    #ok(())
  };

  public query func metrics() : async { articleCount : Nat; playCount : Nat } {
    { articleCount = Map.size(articles); playCount = Map.size(plays) }
  };
}
