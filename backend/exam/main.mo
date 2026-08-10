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

  public type ExamMode = { #Solo; #ShareLink; #Timed };

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

  // ─── State ────────────────────────────────────────────────────────────────

  var sessions : Map.Map<Text, ExamSession> = Map.empty<Text, ExamSession>();

  var shareIndex : Map.Map<Text, Text> = Map.empty<Text, Text>();

  var nextId : Nat = 0;

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

  // ─── Queries ──────────────────────────────────────────────────────────────

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
