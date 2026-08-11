import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

persistent actor Exam {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ExamMode = { #Solo; #ShareLink; #Timed; #Certification };

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

  var examTemplates : Map.Map<Text, ExamTemplate> = Map.empty<Text, ExamTemplate>();

  var nextId         : Nat = 0;
  var nextTemplateId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin guard ──────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createSession(config : ExamConfig, questionIds : [Text]) : async Result.Result<ExamSession, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id  = "ex" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let shareToken : ?Text = switch (config.mode) {
      case (#ShareLink) {
        let t = "eq" # id;
        Map.add(shareIndex, Text.compare, t, id);
        ?t
      };
      case _ null;
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
    #ok(session)
  };

  public shared ({ caller }) func submitExam(id : Text, answers : [AnswerRecord]) : async Result.Result<ExamSession, Text> {
    switch (Map.get(sessions, Text.compare, id)) {
      case null { #err("Session not found") };
      case (?s) {
        if (s.owner != caller) return #err("Not your session");
        var correct : Nat = 0;
        var elapsedTotal : Nat = 0;
        for (a in answers.vals()) {
          if (a.isCorrect) correct += 1;
          elapsedTotal += a.elapsedSec;
        };
        let pct : Nat = if (answers.size() == 0) 0
          else (correct * 100) / answers.size();
        let avgElapsedSec : ?Nat = if (answers.size() == 0) null
          else ?(elapsedTotal / answers.size());
        let updated : ExamSession = {
          id            = s.id;
          owner         = s.owner;
          config        = s.config;
          questionIds   = s.questionIds;
          answers       = answers;
          score         = ?pct;
          avgElapsedSec = avgElapsedSec;
          shareToken    = s.shareToken;
          startedAt     = s.startedAt;
          finishedAt    = ?Time.now();
        };
        Map.add(sessions, Text.compare, id, updated);
        #ok(updated)
      };
    }
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
    let buf = VarArray.repeat<ExamSession>({
      id = ""; owner = caller; config = { sportId = ""; articleIds = []; casebook = false; count = 0; secPerQ = 0; mode = #Solo };
      questionIds = []; answers = []; score = null; avgElapsedSec = null; shareToken = null; startedAt = 0; finishedAt = null;
    }, Map.size(sessions));
    var i = 0;
    for ((_, s) in Map.entries(sessions)) {
      if (s.owner == caller) { buf[i] := s; i += 1 };
    };
    VarArray.sliceToArray<ExamSession>(buf, 0, i)
  };

  // Public by-principal, mirroring ranking.getStats(p)/user.getProfile(p) —
  // association coordinators need per-exam scores for members other than
  // themselves to compute real season-cohort trends (ranking's EloSnapshot
  // only tracks a cumulative running-average accuracy, which is too blunt
  // a signal for "how is this member trending recently").
  public query func getExamsFor(p : Principal) : async [ExamSession] {
    let buf = VarArray.repeat<ExamSession>({
      id = ""; owner = p; config = { sportId = ""; articleIds = []; casebook = false; count = 0; secPerQ = 0; mode = #Solo };
      questionIds = []; answers = []; score = null; avgElapsedSec = null; shareToken = null; startedAt = 0; finishedAt = null;
    }, Map.size(sessions));
    var i = 0;
    for ((_, s) in Map.entries(sessions)) {
      if (s.owner == p) { buf[i] := s; i += 1 };
    };
    VarArray.sliceToArray<ExamSession>(buf, 0, i)
  };

  public query func getByShareToken(token : Text) : async ?ExamSession {
    switch (Map.get(shareIndex, Text.compare, token)) {
      case null null;
      case (?id) Map.get(sessions, Text.compare, id);
    }
  };

  public query func metrics() : async { sessionCount : Nat } {
    { sessionCount = Map.size(sessions) }
  };
}
