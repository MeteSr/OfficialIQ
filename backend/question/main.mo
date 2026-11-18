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
import Random "mo:core/Random";
import Env "../lib/Env";
import Types "../lib/Types";

persistent actor Question {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Difficulty = Types.Difficulty;

  public type Choice = Types.Choice;

  public type Question = Types.Question;

  public type QuestionInput = {
    sportId           : Text;
    articleId         : Text;
    citation          : Text;
    stem              : Text;
    choices           : [Choice];
    correctId         : Text;
    explanation       : Text;
    difficulty        : Difficulty;
    isCasebook        : Bool;
    isPointOfEmphasis : Bool;
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

  // questionId -> (timesAnswered, timesWrong), summed over every official.
  // Kept up to date by recordAnswer so getMostMissedQuestions reads one
  // entry per question instead of scanning `history` (officials x questions),
  // which would exceed a query's instruction limit as the user base grows.
  // A new stable var's initializer runs on the upgrade that introduces it,
  // so this backfills itself from the existing history once.
  public type AnswerTotals = { answered : Nat; wrong : Nat };
  var answerTotals : Map.Map<Text, AnswerTotals> = do {
    let m = Map.empty<Text, AnswerTotals>();
    for ((_, h) in Map.entries(history)) {
      let prev = switch (Map.get(m, Text.compare, h.questionId)) { case (?t) t; case null ({ answered = 0; wrong = 0 }) };
      let wrong = if (h.timesAnswered >= h.timesCorrect) h.timesAnswered - h.timesCorrect else 0;
      Map.add(m, Text.compare, h.questionId, { answered = prev.answered + h.timesAnswered; wrong = prev.wrong + wrong });
    };
    m
  };

  let DAY_NS : Int = 86_400_000_000_000;

  var nextId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin ────────────────────────────────────────────────────────────────

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

  public shared ({ caller }) func addQuestion(input : QuestionInput) : async Result.Result<Question, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "q" # Nat.toText(nextId);
    nextId += 1;
    let q : Question = {
      id                = id;
      sportId           = input.sportId;
      articleId         = input.articleId;
      citation          = input.citation;
      stem              = input.stem;
      choices           = input.choices;
      correctId         = input.correctId;
      explanation       = input.explanation;
      difficulty        = input.difficulty;
      isCasebook        = input.isCasebook;
      isPointOfEmphasis = input.isPointOfEmphasis;
      createdAt         = Time.now();
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
        else (r, Int.abs(Float.toInt(Float.nearest(Int.toFloat(prevIntervalDays) * newEF))));
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
    let totals = switch (Map.get(answerTotals, Text.compare, questionId)) { case (?t) t; case null ({ answered = 0; wrong = 0 }) };
    Map.add(answerTotals, Text.compare, questionId, {
      answered = totals.answered + 1;
      wrong    = totals.wrong + (if (isCorrect) 0 else 1);
    });
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
      difficulty = #Beginner; isCasebook = false; isPointOfEmphasis = false; createdAt = 0;
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

  // Per-question miss rates across every official (answerTotals),
  // for association coordinators to spot content that needs
  // re-explanation across their whole membership. Miss-rate needs at least
  // 3 answers to surface — otherwise one unlucky guess on a rarely-seen
  // question would dominate the list.
  public query func getMostMissedQuestions(sportId : Text, limit : Nat) : async [(Text, Nat, Nat)] {
    let entries = List.empty<(Text, Nat, Nat)>();
    for ((qid, t) in Map.entries(answerTotals)) {
      if (t.answered >= 3) {
        switch (Map.get(questions, Text.compare, qid)) {
          case (?q) { if (q.sportId == sportId) List.add(entries, (qid, t.wrong, t.answered)) };
          case null {};
        };
      };
    };
    let sorted = List.sort<(Text, Nat, Nat)>(entries, func((_, wa, ta), (_, wb, tb)) {
      // Sort by miss rate (wrong/total) descending, comparing via cross-multiplication to avoid float division.
      let lhs = wa * tb;
      let rhs = wb * ta;
      if (lhs > rhs) #less else if (lhs < rhs) #greater else #equal
    });
    List.sliceToArray<(Text, Nat, Nat)>(sorted, 0, Nat.min(limit, List.size(sorted)))
  };

  // (questionId, wrong, answered) across every official for the given
  // questions, so the app can show how many officials made the same call.
  // Unknown or never-answered ids are left out. Capped at 100 ids per call.
  public query func getAnswerRates(questionIds : [Text]) : async [(Text, Nat, Nat)] {
    let out = List.empty<(Text, Nat, Nat)>();
    var n = 0;
    label scan for (qid in questionIds.values()) {
      if (n >= 100) break scan;
      n += 1;
      switch (Map.get(answerTotals, Text.compare, qid)) {
        case (?t) { if (t.answered > 0) List.add(out, (qid, t.wrong, t.answered)) };
        case null {};
      };
    };
    List.sliceToArray<(Text, Nat, Nat)>(out, 0, List.size(out))
  };

  // ─── Graded exams (exam canister only) ──────────────────────────────────────
  //
  // Ranked quizzes, certification exams and challenges are graded by the exam
  // canister, which must hold the answer key without ever sending it to the
  // player. These two calls hand it full questions; only the exam canister
  // may make them (its ID comes from icp deploy's PUBLIC_CANISTER_ID:exam).

  public type ExamPick = Types.ExamPick;

  func isExamCanister<system>(caller : Principal) : Bool {
    switch (Env.canisterId<system>("exam")) { case (?id) id == caller; case null false }
  };

  // Fisher-Yates shuffle in place.
  func shuffle(xs : List.List<Question>, rng : Random.Random) {
    var i = List.size(xs);
    while (i > 1) {
      let j = rng.natRange(0, i);
      i -= 1;
      let tmp = List.at(xs, i);
      List.put(xs, i, List.at(xs, j));
      List.put(xs, j, tmp);
    };
  };

  public shared ({ caller }) func pickForExam(sportId : Text, picks : [ExamPick], player : Principal) : async Result.Result<[Question], Text> {
    if (not isExamCanister<system>(caller)) return #err("Exam canister only");
    // Without shuffling, every official got the same first-N questions (in
    // id order) for an article, so certification exams and ranked quizzes
    // were identical on every attempt. Seeded from raw_rand per call; no
    // state is read or written before this await.
    let rng = Random.seed(await Random.nat64());
    let out = List.empty<Question>();
    for (pick in picks.values()) {
      let filter : QuizFilter = { sportId; articleIds = pick.articleIds; casebook = pick.casebook; difficulty = pick.difficulty; count = pick.count };
      let matches = List.empty<Question>();
      for ((_, q) in Map.entries(questions)) {
        // A question already taken by an earlier pick isn't repeated.
        if (matchesFilter(q, filter) and List.find<Question>(out, func(x) { x.id == q.id }) == null) List.add(matches, q);
      };
      // Shuffled first in both modes: for adaptive picks the sort below is
      // stable, so ties (e.g. never-answered questions) stay in random order.
      shuffle(matches, rng);
      if (pick.adaptive) {
        List.sortInPlace<Question>(matches, func(a, b) { Int.compare(dueDate(player, a.id), dueDate(player, b.id)) });
      };
      for (q in List.sliceToArray<Question>(matches, 0, Nat.min(pick.count, List.size(matches))).values()) List.add(out, q);
    };
    #ok(List.toArray(out))
  };

  public shared ({ caller }) func questionsForExam(ids : [Text]) : async Result.Result<[Question], Text> {
    if (not isExamCanister<system>(caller)) return #err("Exam canister only");
    #ok(Array.filterMap<Text, Question>(ids, func(id) { Map.get(questions, Text.compare, id) }))
  };

  public query func metrics() : async { questionCount : Nat } {
    { questionCount = Map.size(questions) }
  };
}
