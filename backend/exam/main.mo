import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

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
    id         : Text;
    owner      : Principal;
    config     : ExamConfig;
    questionIds: [Text];
    answers    : [AnswerRecord];
    score      : ?Nat;   // percentage 0-100, set when submitted
    shareToken : ?Text;
    startedAt  : Int;
    finishedAt : ?Int;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var sessions : HashMap.HashMap<Text, ExamSession> =
    HashMap.HashMap<Text, ExamSession>(256, Text.equal, Text.hash);

  var shareIndex : HashMap.HashMap<Text, Text> =
    HashMap.HashMap<Text, Text>(256, Text.equal, Text.hash);

  var nextId : Nat = 0;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  func genToken(id : Text, ts : Int) : Text {
    // Deterministic short token — good enough for share links (no crypto needed here)
    "eq" # id # Text.fromChar(if (ts % 2 == 0) 'a' else 'b')
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createSession(config : ExamConfig, questionIds : [Text]) : async Result.Result<ExamSession, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id = "ex" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let shareToken : ?Text = switch config.mode {
      case (#ShareLink) {
        let t = genToken(id, now);
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
        let correct = Array.foldLeft<AnswerRecord, Nat>(answers, 0, func(acc, a) {
          if (a.isCorrect) acc + 1 else acc
        });
        let pct : Nat = if (answers.size() == 0) 0
          else (correct * 100) / answers.size();
        let updated : ExamSession = {
          s with
          answers    = answers;
          score      = ?pct;
          finishedAt = ?Time.now();
        };
        sessions.put(id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyExams() : async [ExamSession] {
    var out : [ExamSession] = [];
    for ((_, s) in sessions.entries()) {
      if (s.owner == caller) out := Array.append(out, [s]);
    };
    out
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
