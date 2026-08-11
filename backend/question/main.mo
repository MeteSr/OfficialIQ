import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Float "mo:core/Float";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

persistent actor Question {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Difficulty = { #Beginner; #Intermediate; #Advanced; #Expert };

  public type Choice = { id : Text; text : Text };

  public type Question = {
    id          : Text;
    sportId     : Text;
    articleId   : Text;
    citation    : Text;
    stem        : Text;
    choices     : [Choice];
    correctId   : Text;
    explanation : Text;
    difficulty  : Difficulty;
    isCasebook  : Bool;
    createdAt   : Int;
  };

  public type QuestionInput = {
    sportId     : Text;
    articleId   : Text;
    citation    : Text;
    stem        : Text;
    choices     : [Choice];
    correctId   : Text;
    explanation : Text;
    difficulty  : Difficulty;
    isCasebook  : Bool;
  };

  public type QuizFilter = {
    sportId    : Text;
    articleIds : [Text];
    casebook   : Bool;
    difficulty : ?Difficulty;
    count      : Nat;
  };

  // Per-(user, question) SM-2 spaced-repetition state.
  public type UserQuestionHistory = {
    questionId    : Text;
    timesAnswered : Nat;
    timesCorrect  : Nat;
    lastAnswered  : Int;
    nextDue       : Int;
    easiness      : Float;
    repetitions   : Nat;
    intervalDays  : Nat;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var questions : Map.Map<Text, Question> = Map.empty<Text, Question>();

  // Keyed by "<principal>::<questionId>" — Map needs a single comparable
  // key type, so the pair is flattened into one Text rather than using a
  // tuple key.
  var history : Map.Map<Text, UserQuestionHistory> = Map.empty<Text, UserQuestionHistory>();

  let DAY_NS : Int = 86_400_000_000_000;

  var nextId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin ────────────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  public shared ({ caller }) func addQuestion(input : QuestionInput) : async Result.Result<Question, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "q" # Nat.toText(nextId);
    nextId += 1;
    let q : Question = {
      id          = id;
      sportId     = input.sportId;
      articleId   = input.articleId;
      citation    = input.citation;
      stem        = input.stem;
      choices     = input.choices;
      correctId   = input.correctId;
      explanation = input.explanation;
      difficulty  = input.difficulty;
      isCasebook  = input.isCasebook;
      createdAt   = Time.now();
    };
    Map.add(questions, Text.compare, id, q);
    #ok(q)
  };

  // Records the result of answering a question and advances its SM-2 state.
  // `caller` (not a passed-in userId) identifies whose history this is, so a
  // user can only ever write their own spaced-repetition state.
  //
  // Quality is collapsed to two buckets since quizzes are binary right/wrong:
  // correct -> q=5 (full recall), wrong -> q=1 (near-total lapse). A wrong
  // answer always resets repetitions and drops the interval back to 1 day;
  // consecutive correct answers grow the interval by the easiness factor,
  // per the classic SM-2 schedule (1 day, 6 days, then interval * EF).
  public shared ({ caller }) func recordAnswer(questionId : Text, isCorrect : Bool) : async () {
    let key = Principal.toText(caller) # "::" # questionId;
    let now = Time.now();
    let prev = Map.get(history, Text.compare, key);

    let prevEF : Float = switch prev { case (?h) h.easiness; case null 2.5 };
    let prevReps : Nat = switch prev { case (?h) h.repetitions; case null 0 };
    let prevIntervalDays : Nat = switch prev { case (?h) h.intervalDays; case null 1 };

    let quality : Float = if (isCorrect) 5.0 else 1.0;
    let deltaEF = 0.1 - (5.0 - quality) * (0.08 + (5.0 - quality) * 0.02);
    let newEF = Float.max(1.3, prevEF + deltaEF);

    let (newReps, newIntervalDays) : (Nat, Nat) =
      if (not isCorrect) { (0, 1) }
      else {
        let r = prevReps + 1;
        if (r <= 1) (r, 1)
        else if (r == 2) (r, 6)
        else (r, Int.abs(Float.toInt(Float.nearest(Float.fromInt(prevIntervalDays) * newEF))));
      };

    let entry : UserQuestionHistory = {
      questionId    = questionId;
      timesAnswered = (switch prev { case (?h) h.timesAnswered; case null 0 }) + 1;
      timesCorrect  = (switch prev { case (?h) h.timesCorrect; case null 0 }) + (if (isCorrect) 1 else 0);
      lastAnswered  = now;
      nextDue       = now + newIntervalDays * DAY_NS;
      easiness      = newEF;
      repetitions   = newReps;
      intervalDays  = newIntervalDays;
    };
    Map.add(history, Text.compare, key, entry);
  };

  func matchesFilter(q : Question, filter : QuizFilter) : Bool {
    if (q.sportId != filter.sportId or q.isCasebook != filter.casebook) return false;
    let articleMatch : Bool =
      filter.articleIds.size() == 0 or
      Array.find<Text>(filter.articleIds, func(a) { a == q.articleId }) != null;
    let diffMatch : Bool = switch (filter.difficulty) {
      case null true;
      case (?d) switch (q.difficulty, d) {
        case (#Beginner,     #Beginner)     true;
        case (#Intermediate, #Intermediate) true;
        case (#Advanced,     #Advanced)     true;
        case (#Expert,       #Expert)       true;
        case _                              false;
      };
    };
    articleMatch and diffMatch
  };

  // Never-answered questions are treated as due right now, so they interleave
  // naturally with genuinely overdue ones once sorted ascending by due date.
  func dueDate(caller : Principal, questionId : Text) : Int {
    switch (Map.get(history, Text.compare, Principal.toText(caller) # "::" # questionId)) {
      case (?h) h.nextDue;
      case null Time.now();
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getQuestion(id : Text) : async ?Question {
    Map.get(questions, Text.compare, id)
  };

  // Returns up to `filter.count` matching questions, most-overdue (or never
  // seen) first — see dueDate(). Wrong answers reset to a 1-day interval, so
  // they resurface sooner than questions answered correctly.
  public shared query ({ caller }) func getAdaptiveQuiz(filter : QuizFilter) : async [Question] {
    let matches = List.empty<Question>();
    for ((_, q) in Map.entries(questions)) {
      if (matchesFilter(q, filter)) { List.add(matches, q) };
    };
    List.sortInPlace<Question>(matches, func(a, b) { Int.compare(dueDate(caller, a.id), dueDate(caller, b.id)) });
    List.sliceToArray<Question>(matches, 0, Nat.min(filter.count, List.size(matches)))
  };

  // Count of matching questions currently due (or never answered) for the caller.
  public shared query ({ caller }) func getDueCount(sportId : Text, articleIds : [Text], casebook : Bool) : async Nat {
    let now = Time.now();
    var count = 0;
    for ((_, q) in Map.entries(questions)) {
      if (q.sportId == sportId and q.isCasebook == casebook) {
        let articleMatch : Bool =
          articleIds.size() == 0 or
          Array.find<Text>(articleIds, func(a) { a == q.articleId }) != null;
        if (articleMatch and dueDate(caller, q.id) <= now) { count += 1 };
      };
    };
    count
  };

  // Batched history lookup (order-preserving) for the "Why this question?" explainer.
  public shared query ({ caller }) func getMyHistoryBatch(questionIds : [Text]) : async [?UserQuestionHistory] {
    Array.map<Text, ?UserQuestionHistory>(questionIds, func(id) {
      Map.get(history, Text.compare, Principal.toText(caller) # "::" # id)
    })
  };

  public query func sampleQuiz(filter : QuizFilter) : async [Question] {
    let buf = VarArray.repeat<Question>({
      id = ""; sportId = ""; articleId = ""; citation = ""; stem = "";
      choices = []; correctId = ""; explanation = "";
      difficulty = #Beginner; isCasebook = false; createdAt = 0;
    }, Map.size(questions));
    var i = 0;
    for ((_, q) in Map.entries(questions)) {
      if (q.sportId == filter.sportId and q.isCasebook == filter.casebook) {
        let articleMatch : Bool =
          filter.articleIds.size() == 0 or
          Array.find<Text>(filter.articleIds, func(a) { a == q.articleId }) != null;
        let diffMatch : Bool = switch (filter.difficulty) {
          case null true;
          case (?d) switch (q.difficulty, d) {
            case (#Beginner,     #Beginner)     true;
            case (#Intermediate, #Intermediate) true;
            case (#Advanced,     #Advanced)     true;
            case (#Expert,       #Expert)       true;
            case _                              false;
          };
        };
        if (articleMatch and diffMatch and i < filter.count) {
          buf[i] := q;
          i += 1;
        };
      };
    };
    VarArray.sliceToArray<Question>(buf, 0, i)
  };

  public query func metrics() : async { questionCount : Nat } {
    { questionCount = Map.size(questions) }
  };
}
