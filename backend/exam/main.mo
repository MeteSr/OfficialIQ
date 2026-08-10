import HashMap "mo:base/HashMap";  // mo:core/Map migration pending
import Text "mo:core/Text";
import Array "mo:core/Array";
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
    id          : Text;
    owner       : Principal;
    config      : ExamConfig;
    questionIds : [Text];
    answers     : [AnswerRecord];
    score       : ?Nat;
    shareToken  : ?Text;
    startedAt   : Int;
    finishedAt  : ?Int;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var sessions : HashMap.HashMap<Text, ExamSession> =
    HashMap.HashMap<Text, ExamSession>(256, Text.equal, Text.hash);

  var shareIndex : HashMap.HashMap<Text, Text> =
    HashMap.HashMap<Text, Text>(256, Text.equal, Text.hash);

  var nextId : Nat = 0;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createSession(config : ExamConfig, questionIds : [Text]) : async Result.Result<ExamSession, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id  = "ex" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let shareToken : ?Text = switch config.mode {
      case (#ShareLink) {
        let t = "eq" # id;
        shareIndex.put(t, id);
        ?t
      };
      case _ null;
    };
    let session : ExamSession = {
      id          = id;
      owner       = caller;
      config      = config;
      questionIds = questionIds;
      answers     = [];
      score       = null;
      shareToken  = shareToken;
      startedAt   = now;
      finishedAt  = null;
    };
    sessions.put(id, session);
    #ok(session)
  };

  public shared ({ caller }) func submitExam(id : Text, answers : [AnswerRecord]) : async Result.Result<ExamSession, Text> {
    switch (sessions.get(id)) {
      case null { #err("Session not found") };
      case (?s) {
        if (s.owner != caller) return #err("Not your session");
        var correct : Nat = 0;
        for (a in answers.vals()) { if (a.isCorrect) correct += 1 };
        let pct : Nat = if (answers.size() == 0) 0
          else (correct * 100) / answers.size();
        let updated : ExamSession = {
          id          = s.id;
          owner       = s.owner;
          config      = s.config;
          questionIds = s.questionIds;
          answers     = answers;
          score       = ?pct;
          shareToken  = s.shareToken;
          startedAt   = s.startedAt;
          finishedAt  = ?Time.now();
        };
        sessions.put(id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyExams() : async [ExamSession] {
    let buf = Array.init<ExamSession>(sessions.size(), {
      id = ""; owner = caller; config = { sportId = ""; articleIds = []; casebook = false; count = 0; secPerQ = 0; mode = #Solo };
      questionIds = []; answers = []; score = null; shareToken = null; startedAt = 0; finishedAt = null;
    });
    var i = 0;
    for ((_, s) in sessions.entries()) {
      if (s.owner == caller) { buf[i] := s; i += 1 };
    };
    Array.tabulate<ExamSession>(i, func(j) { buf[j] })
  };

  public query func getByShareToken(token : Text) : async ?ExamSession {
    switch (shareIndex.get(token)) {
      case null null;
      case (?id) sessions.get(id);
    }
  };

  public query func metrics() : async { sessionCount : Nat } {
    { sessionCount = sessions.size() }
  };
}
