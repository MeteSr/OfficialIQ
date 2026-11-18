import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Token "../lib/Token";
import Env "../lib/Env";
import Index "../lib/Index";
import Types "../lib/Types";

persistent actor Exam {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ExamMode = Types.ExamMode;

  public type ExamConfig = {
    sportId    : Text;
    articleIds : [Text];
    casebook   : Bool;
    count      : Nat;
    secPerQ    : Nat;
    mode       : ExamMode;
  };

  public type AnswerRecord = {
    questionId : Text;
    chosenId   : Text;
    isCorrect  : Bool;
    elapsedSec : Nat;
  };

  public type ExamSession = {
    id            : Text;
    owner         : Principal;
    config        : ExamConfig;
    questionIds   : [Text];
    answers       : [AnswerRecord];
    score         : ?Nat;
    avgElapsedSec : ?Nat;
    shareToken    : ?Text;
    startedAt     : Int;
    finishedAt    : ?Int;
  };

  // Admin-configurable certification exam format: how many questions, how
  // long, what fraction should be casebook, and how article selection is
  // weighted (a plain list of (articleId, weight) pairs; weight is relative,
  // not a percentage).
  public type ExamTemplate = {
    id               : Text;
    name             : Text;
    sportId          : Text;
    questionCount    : Nat;
    timeLimitSec     : Nat;
    casebookRatioPct : Nat; // 0-100
    passThresholdPct : Nat; // 0-100
    articleWeights   : [(Text, Nat)];
    createdAt        : Int;
  };

  public type ExamTemplateInput = {
    name             : Text;
    sportId          : Text;
    questionCount    : Nat;
    timeLimitSec     : Nat;
    casebookRatioPct : Nat;
    passThresholdPct : Nat;
    articleWeights   : [(Text, Nat)];
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var sessions : Map.Map<Text, ExamSession> = Map.empty<Text, ExamSession>();

  var shareIndex : Map.Map<Text, Text> = Map.empty<Text, Text>();

  // owner -> session ids (lib/Index.mo); built from `sessions` on the upgrade
  // that adds it.
  var sessionsByOwner : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((id, s) in Map.entries(sessions)) Index.add(ix, Principal.compare, s.owner, id);
    ix
  };

  var examTemplates : Map.Map<Text, ExamTemplate> = Map.empty<Text, ExamTemplate>();

  var nextId         : Nat = 0;
  var nextTemplateId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  let MAX_QUESTIONS : Nat = 200;

  // ─── Admin guard ──────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null {
        // Bootstrap is controller-only, so nobody can claim admin on a freshly
        // deployed canister before its deployer does (canister-security skill).
        if (not Principal.isController(caller)) return #err("Only a canister controller can set the first admin");
        adminPrincipal := ?p;
        #ok(())
      };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createSession(config : ExamConfig, questionIds : [Text]) : async Result.Result<ExamSession, Text> {
    refreshEnv<system>();
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (questionIds.size() > MAX_QUESTIONS or config.articleIds.size() > MAX_QUESTIONS) return #err("Too many questions");
    // Share tokens are bearer links, so they come from raw_rand rather than
    // the session counter (a counter-derived "eqex0", "eqex1", ... can be
    // enumerated). Drawn before the id so no state changes across the await.
    let token : ?Text = switch (config.mode) {
      case (#ShareLink) ?(await Token.hex("eq"));
      case _ null;
    };
    let id  = "ex" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let shareToken : ?Text = switch token {
      case (?t) { Map.add(shareIndex, Text.compare, t, id); ?t };
      case null null;
    };
    let session : ExamSession = {
      id            = id;
      owner         = caller;
      config        = config;
      questionIds   = questionIds;
      answers       = [];
      score         = null;
      avgElapsedSec = null;
      shareToken    = shareToken;
      startedAt     = now;
      finishedAt    = null;
    };
    Map.add(sessions, Text.compare, id, session);
    Index.add(sessionsByOwner, Principal.compare, caller, id);
    #ok(session)
  };

  // Client-graded submission is retired: answers are graded here, one at a
  // time (answerQuestion) or in one batch (submitGradedAnswers). Kept so
  // older clients get a clear error.
  public shared func submitExam(_id : Text, _answers : [AnswerRecord]) : async Result.Result<ExamSession, Text> {
    #err("Exams are graded by OfficialIQ now. Update the app and retake this quiz.")
  };

  public shared ({ caller }) func upsertExamTemplate(input : ExamTemplateInput) : async Result.Result<ExamTemplate, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "tmpl" # Nat.toText(nextTemplateId);
    nextTemplateId += 1;
    let t : ExamTemplate = {
      id;
      name             = input.name;
      sportId          = input.sportId;
      questionCount    = input.questionCount;
      timeLimitSec     = input.timeLimitSec;
      casebookRatioPct = input.casebookRatioPct;
      passThresholdPct = input.passThresholdPct;
      articleWeights   = input.articleWeights;
      createdAt        = Time.now();
    };
    Map.add(examTemplates, Text.compare, id, t);
    #ok(t)
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func listExamTemplates(sportId : Text) : async [ExamTemplate] {
    let buf = VarArray.repeat<ExamTemplate>({
      id = ""; name = ""; sportId = ""; questionCount = 0; timeLimitSec = 0;
      casebookRatioPct = 0; passThresholdPct = 0; articleWeights = []; createdAt = 0;
    }, Map.size(examTemplates));
    var i = 0;
    for ((_, t) in Map.entries(examTemplates)) {
      if (t.sportId == sportId) { buf[i] := t; i += 1 };
    };
    VarArray.sliceToArray<ExamTemplate>(buf, 0, i)
  };

  public query func getExamTemplate(id : Text) : async ?ExamTemplate {
    Map.get(examTemplates, Text.compare, id)
  };

  public shared query ({ caller }) func getMyExams() : async [ExamSession] {
    examsOf(caller)
  };

  // An official's exam history is private: getExamsFor answers only for the
  // caller themself (and the admin). Coordinators read their members'
  // history through getMemberExams, which checks with the association
  // canister (hence a composite query).
  // A query can't read canister environment variables (icp-cli skill,
  // canister-env-vars), so the sibling canisters' IDs are copied into stable
  // vars by every update call (refreshEnv) and read from there by queries.
  // They can't be read while the canister initialises either: reading an
  // environment variable during install traps with "ic0.env_var_name_exists:
  // Variable name is not a valid UTF-8 string" and the install fails (found by
  // the canister integration tests). Stable, so an upgrade keeps them.
  var ASSOCIATION_ID : ?Principal = null;
  var RANKING_ID : ?Principal = null;
  var CHALLENGE_ID : ?Principal = null;

  func refreshEnv<system>() {
    switch (Env.canisterId<system>("association")) { case (?id) ASSOCIATION_ID := ?id; case null {} };
    switch (Env.canisterId<system>("ranking")) { case (?id) RANKING_ID := ?id; case null {} };
    switch (Env.canisterId<system>("challenge")) { case (?id) CHALLENGE_ID := ?id; case null {} };
  };

  func isSiblingCanister(p : Principal) : Bool {
    ASSOCIATION_ID == ?p or RANKING_ID == ?p or CHALLENGE_ID == ?p
  };

  type AssociationCheck = actor { isCoordinatorOf : shared query (Principal, Principal) -> async Bool };

  public shared query ({ caller }) func getExamsFor(p : Principal) : async [ExamSession] {
    if (caller != p and not isAdmin(caller)) return [];
    examsOf(p)
  };

  public shared composite query ({ caller }) func getMemberExams(p : Principal) : async [ExamSession] {
    if (caller != p) {
      let allowed = switch (ASSOCIATION_ID) {
        case (?id) { await (actor (Principal.toText(id)) : AssociationCheck).isCoordinatorOf(caller, p) };
        case null false;
      };
      if (not allowed) return [];
    };
    examsOf(p)
  };

  func examsOf(p : Principal) : [ExamSession] {
    Index.rows(sessionsByOwner, Principal.compare, p, sessions)
  };

  public query func getByShareToken(token : Text) : async ?ExamSession {
    switch (Map.get(shareIndex, Text.compare, token)) {
      case null null;
      case (?id) Map.get(sessions, Text.compare, id);
    }
  };

  // ─── Graded sessions ───────────────────────────────────────────────────────
  //
  // Ranked quizzes, certification exams and challenges are graded here. The
  // player only ever receives questions without their answers
  // (QuestionView); each answer is checked and recorded once, here, before
  // the correct choice is revealed. Ranking, challenge and association then
  // read the result from this canister (gradedResult) instead of trusting a
  // score from the browser.

  public type Difficulty = Types.Difficulty;
  public type Choice = Types.Choice;

  type FullQuestion = Types.Question;

  public type QuestionView = {
    id : Text; sportId : Text; articleId : Text; citation : Text; stem : Text;
    choices : [Choice]; difficulty : Difficulty; isCasebook : Bool; isPointOfEmphasis : Bool;
  };

  public type Pick = Types.ExamPick;

  public type QuestionSource = {
    #Picks      : [Pick];  // the canister picks questions (quizzes, cert exams)
    #Ids        : [Text];  // a fixed set (challenges)
    #ShareToken : Text;    // the same questions as a shared exam link
  };

  public type GradedStart = { session : ExamSession; questions : [QuestionView] };

  public type AnswerFeedback = {
    questionId  : Text;
    isCorrect   : Bool;
    correctId   : Text;
    explanation : Text;
    citation    : Text;
  };

  public type GradedFinish = { session : ExamSession; feedback : [AnswerFeedback] };

  // What other canisters read (lib/Types.mo).
  public type GradedResult = Types.GradedResult;

  type KeyEntry = { questionId : Text; correctId : Text; explanation : Text; citation : Text };

  // Session id -> answer key. Only graded sessions have one.
  var answerKeys : Map.Map<Text, [KeyEntry]> = Map.empty<Text, [KeyEntry]>();

  // "<player>|<question ids>" -> session id, for fixed question sets
  // (challenges): a player gets one graded session per set, resumed rather
  // than restarted, so they can't retake it until they like the score.
  var fixedSetSessions : Map.Map<Text, Text> = Map.empty<Text, Text>();

  func fixedSetKey(p : Principal, ids : [Text]) : Text {
    var k = Principal.toText(p) # "|";
    for (id in ids.values()) { k := k # id # "," };
    k
  };

  let MAX_PICKS : Nat = 50;
  // Grace on top of the session's time budget for network latency.
  let GRACE_NS : Int = 120_000_000_000;

  type QuestionCanister = actor {
    pickForExam      : shared (Text, [Pick], Principal) -> async Result.Result<[FullQuestion], Text>;
    questionsForExam : shared [Text] -> async Result.Result<[FullQuestion], Text>;
  };

  func viewOf(q : FullQuestion) : QuestionView {
    { id = q.id; sportId = q.sportId; articleId = q.articleId; citation = q.citation; stem = q.stem;
      choices = q.choices; difficulty = q.difficulty; isCasebook = q.isCasebook; isPointOfEmphasis = q.isPointOfEmphasis }
  };

  func keyFor(sessionId : Text, questionId : Text) : ?KeyEntry {
    switch (Map.get(answerKeys, Text.compare, sessionId)) {
      case null null;
      case (?key) Array.find<KeyEntry>(key, func(k) { k.questionId == questionId });
    }
  };

  func feedbackOf(k : KeyEntry, isCorrect : Bool) : AnswerFeedback {
    { questionId = k.questionId; isCorrect; correctId = k.correctId; explanation = k.explanation; citation = k.citation }
  };

  // Time budget: secPerQ per question, plus grace. Answers after it are refused.
  func deadlineOf(s : ExamSession) : Int {
    s.startedAt + s.config.secPerQ * s.questionIds.size() * 1_000_000_000 + GRACE_NS
  };

  public shared ({ caller }) func startGradedSession(config : ExamConfig, source : QuestionSource) : async Result.Result<GradedStart, Text> {
    refreshEnv<system>();
    await* startFor(caller, config, source)
  };

  func startFor<system>(caller : Principal, config : ExamConfig, source : QuestionSource) : async* Result.Result<GradedStart, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to take a ranked quiz");
    if (config.secPerQ == 0 or config.secPerQ > 600) return #err("secPerQ must be 1-600");
    let questionId = switch (Env.canisterId<system>("question")) {
      case (?id) id;
      case null return #err("Question bank not configured");
    };
    let qc = actor (Principal.toText(questionId)) : QuestionCanister;

    // Every await happens before any state changes below.
    let fetched : Result.Result<[FullQuestion], Text> = switch source {
      case (#Picks(picks)) {
        if (picks.size() == 0 or picks.size() > MAX_PICKS) return #err("1-" # Nat.toText(MAX_PICKS) # " picks");
        var total = 0;
        for (p in picks.values()) { total += p.count };
        if (total > MAX_QUESTIONS) return #err("Too many questions");
        await qc.pickForExam(config.sportId, picks, caller)
      };
      case (#Ids(ids)) {
        if (ids.size() == 0 or ids.size() > MAX_QUESTIONS) return #err("1-" # Nat.toText(MAX_QUESTIONS) # " questions");
        let r = await qc.questionsForExam(ids);
        // Resume the player's existing session for this set, if any.
        switch (Map.get(fixedSetSessions, Text.compare, fixedSetKey(caller, ids))) {
          case (?sid) {
            switch (Map.get(sessions, Text.compare, sid), r) {
              case (?existing, #ok(qs)) return #ok({ session = existing; questions = Array.map<FullQuestion, QuestionView>(qs, viewOf) });
              case _ {};
            };
          };
          case null {};
        };
        r
      };
      case (#ShareToken(token)) {
        let shared_ = switch (Map.get(shareIndex, Text.compare, token)) {
          case (?id) Map.get(sessions, Text.compare, id);
          case null null;
        };
        switch shared_ {
          case null return #err("This exam link isn't valid");
          case (?sh) await qc.questionsForExam(sh.questionIds);
        }
      };
    };
    let qs = switch fetched {
      case (#ok(qs)) qs;
      case (#err(e)) return #err(e);
    };
    if (qs.size() == 0) return #err("No questions match");

    let token : ?Text = switch (config.mode) {
      case (#ShareLink) ?(await Token.hex("eq"));
      case _ null;
    };

    let id = "ex" # Nat.toText(nextId);
    nextId += 1;
    let questionIds = Array.map<FullQuestion, Text>(qs, func(q) { q.id });
    let session : ExamSession = {
      id; owner = caller;
      config = { config with count = qs.size() };
      questionIds; answers = []; score = null; avgElapsedSec = null;
      shareToken = token; startedAt = Time.now(); finishedAt = null;
    };
    switch token { case (?t) Map.add(shareIndex, Text.compare, t, id); case null {} };
    switch source {
      case (#Ids(ids)) {
        // Re-checked after the awaits: a concurrent start may have won.
        let k = fixedSetKey(caller, ids);
        switch (Map.get(fixedSetSessions, Text.compare, k)) {
          case (?sid) {
            switch (Map.get(sessions, Text.compare, sid)) {
              case (?existing) return #ok({ session = existing; questions = Array.map<FullQuestion, QuestionView>(qs, viewOf) });
              case null {};
            };
          };
          case null {};
        };
        Map.add(fixedSetSessions, Text.compare, k, id);
      };
      case _ {};
    };
    Map.add(sessions, Text.compare, id, session);
    Index.add(sessionsByOwner, Principal.compare, caller, id);
    Map.add(answerKeys, Text.compare, id, Array.map<FullQuestion, KeyEntry>(qs, func(q) {
      { questionId = q.id; correctId = q.correctId; explanation = q.explanation; citation = q.citation }
    }));
    #ok({ session; questions = Array.map<FullQuestion, QuestionView>(qs, viewOf) })
  };

  // Shared exam links: the canister picks the questions and stores them under
  // a token; whoever opens the link (the creator included) takes them in a
  // graded session of their own (startGradedSession with #ShareToken).
  public shared ({ caller }) func createShareLink(config : ExamConfig, picks : [Pick]) : async Result.Result<Text, Text> {
    refreshEnv<system>();
    switch (await* startFor(caller, { config with mode = #ShareLink }, #Picks(picks))) {
      case (#ok(start)) {
        switch (start.session.shareToken) {
          case (?t) {
            // The link's own session is never played; drop its key so it
            // can't be graded or counted.
            Map.remove(answerKeys, Text.compare, start.session.id);
            #ok(t)
          };
          case null #err("No share token");
        }
      };
      case (#err(e)) #err(e);
    }
  };

  func recordGraded(s : ExamSession, questionId : Text, chosenId : Text, elapsedSec : Nat) : Result.Result<AnswerFeedback, Text> {
    if (s.finishedAt != null) return #err("This exam is finished");
    if (Time.now() > deadlineOf(s)) return #err("Time is up for this exam");
    let k = switch (keyFor(s.id, questionId)) {
      case (?k) k;
      case null return #err("Not a question in this exam");
    };
    if (Array.find<AnswerRecord>(s.answers, func(a) { a.questionId == questionId }) != null) {
      return #err("Already answered");
    };
    let isCorrect = chosenId == k.correctId;
    let rec : AnswerRecord = { questionId; chosenId; isCorrect; elapsedSec = Nat.min(elapsedSec, s.config.secPerQ) };
    Map.add(sessions, Text.compare, s.id, { s with answers = Array.concat<AnswerRecord>(s.answers, [rec]) });
    #ok(feedbackOf(k, isCorrect))
  };

  func gradedSession(caller : Principal, sessionId : Text) : Result.Result<ExamSession, Text> {
    switch (Map.get(sessions, Text.compare, sessionId)) {
      case null #err("Session not found");
      case (?s) {
        if (s.owner != caller) return #err("Not your session");
        if (Map.get(answerKeys, Text.compare, sessionId) == null) return #err("Not a graded session");
        #ok(s)
      };
    }
  };

  /// Answers one question and reveals it. One answer per question; a
  /// timeout is sent as any chosenId that isn't a choice (e.g. "__timeout__").
  public shared ({ caller }) func answerQuestion(sessionId : Text, questionId : Text, chosenId : Text, elapsedSec : Nat) : async Result.Result<AnswerFeedback, Text> {
    refreshEnv<system>();
    switch (gradedSession(caller, sessionId)) {
      case (#err(e)) #err(e);
      case (#ok(s)) recordGraded(s, questionId, chosenId, elapsedSec);
    }
  };

  func finish(s0 : ExamSession) : GradedFinish {
    let s = switch (Map.get(sessions, Text.compare, s0.id)) { case (?x) x; case null s0 };
    let finished = if (s.finishedAt != null) s else {
      let total = s.questionIds.size();
      var correct = 0;
      var elapsed = 0;
      for (a in s.answers.values()) { if (a.isCorrect) correct += 1; elapsed += a.elapsedSec };
      let done = { s with
        score = ?(if (total == 0) 0 else correct * 100 / total);
        avgElapsedSec = if (s.answers.size() == 0) null else ?(elapsed / s.answers.size());
        finishedAt = ?Time.now();
      };
      Map.add(sessions, Text.compare, s.id, done);
      done
    };
    let key = switch (Map.get(answerKeys, Text.compare, s.id)) { case (?k) k; case null [] };
    let feedback = Array.map<KeyEntry, AnswerFeedback>(key, func(k) {
      let ok = switch (Array.find<AnswerRecord>(finished.answers, func(a) { a.questionId == k.questionId })) {
        case (?a) a.isCorrect;
        case null false;
      };
      feedbackOf(k, ok)
    });
    { session = finished; feedback }
  };

  /// Finishes a session (unanswered questions count as wrong) and returns
  /// the full answer key. Safe to call again.
  public shared ({ caller }) func finishSession(sessionId : Text) : async Result.Result<GradedFinish, Text> {
    refreshEnv<system>();
    switch (gradedSession(caller, sessionId)) {
      case (#err(e)) #err(e);
      case (#ok(s)) #ok(finish(s));
    }
  };

  /// Certification-style exams: answers are hidden until the end, so they
  /// arrive as one batch, are graded here, and the session is finished.
  public shared ({ caller }) func submitGradedAnswers(sessionId : Text, answers : [(Text, Text, Nat)]) : async Result.Result<GradedFinish, Text> {
    if (answers.size() > MAX_QUESTIONS) return #err("Too many answers");
    switch (gradedSession(caller, sessionId)) {
      case (#err(e)) #err(e);
      case (#ok(s)) {
        for ((qid, chosenId, elapsed) in answers.values()) {
          switch (Map.get(sessions, Text.compare, sessionId)) {
            case (?cur) ignore recordGraded(cur, qid, chosenId, elapsed);
            case null {};
          };
        };
        #ok(finish(s))
      };
    }
  };

  /// The server-computed result of a finished graded session, for the
  /// session's owner and the ranking/challenge/association canisters.
  public shared query ({ caller }) func gradedResult(sessionId : Text) : async ?GradedResult {
    let s = switch (Map.get(sessions, Text.compare, sessionId)) { case (?s) s; case null return null };
    if (caller != s.owner and not isSiblingCanister(caller)) return null;
    if (Map.get(answerKeys, Text.compare, sessionId) == null) return null;
    let finishedAt = switch (s.finishedAt) { case (?t) t; case null return null };
    var correct = 0;
    for (a in s.answers.values()) { if (a.isCorrect) correct += 1 };
    ?{
      id = s.id; owner = s.owner; mode = s.config.mode; sportId = s.config.sportId;
      articleIds = s.config.articleIds; questionIds = s.questionIds;
      questionCount = s.questionIds.size(); answered = s.answers.size(); correct;
      score = switch (s.score) { case (?x) x; case null 0 };
      avgElapsedSec = switch (s.avgElapsedSec) { case (?x) x; case null 0 };
      finishedAt;
    }
  };

  public query func metrics() : async { sessionCount : Nat } {
    { sessionCount = Map.size(sessions) }
  };
}
