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
import Set "mo:core/Set";
import Env "../lib/Env";
import Types "../lib/Types";
import Billing "../lib/Billing";
import Timer "mo:core/Timer";

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
    recordFor(caller, questionId, isCorrect);
  };

  // Graded sessions the exam canister has pushed, so a retry counts once.
  var gradedAnswerSessions : Set.Set<Text> = Set.empty<Text>();

  /// Called by the exam canister when a quiz or exam finishes, with the
  /// player's graded answers: updates their spaced-repetition history and
  /// the per-question totals, as recordAnswer did from the browser. Safe to
  /// repeat.
  public shared ({ caller }) func recordGradedAnswers(player : Principal, sessionId : Text, answers : [(Text, Bool)]) : async Result.Result<(), Text> {
    refreshEnv<system>();
    if (not isExamCanister<system>(caller)) return #err("Exam canister only");
    if (answers.size() > 200) return #err("Too many answers");
    if (Set.contains(gradedAnswerSessions, Text.compare, sessionId)) return #ok(());
    Set.add(gradedAnswerSessions, Text.compare, sessionId);
    for ((questionId, isCorrect) in answers.values()) recordFor(player, questionId, isCorrect);
    #ok(())
  };

  func recordFor(caller : Principal, questionId : Text, isCorrect : Bool) {
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

  /// A sport's whole question bank, a page at a time in id order, for the
  /// app's offline cache (sampleQuiz capped it at 500 per type with no way
  /// to get the rest). Pass the previous page's `next` as `after`.
  public query func listForSync(sportId : Text, after : ?Text, limit : Nat) : async { questions : [Question]; next : ?Text } {
    let cap = Nat.min(limit, 500);
    if (cap == 0) return { questions = []; next = null };
    let out = List.empty<Question>();
    let from = switch after { case (?a) Map.entriesFrom(questions, Text.compare, a); case null Map.entries(questions) };
    var next : ?Text = null;
    label scan for ((id, q) in from) {
      if (after == ?id) continue scan;
      if (q.sportId == sportId) {
        if (List.size(out) == cap) { next := ?List.at(out, cap - 1).id; break scan };
        List.add(out, q);
      };
    };
    { questions = List.toArray(out); next }
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

  // (articleId, wrong, answered) for the caller's own answers in a sport,
  // the articles they miss most first, for the game-day refresher (#63).
  // Reads only the caller's slice of `history`: its keys are
  // "<principal>::<questionId>", so they sit together in key order.
  // Articles answered right every time are left out.
  //
  // This targeting is what makes the game-day refresher (#63) a Pro feature
  // (#71): once the paywall is on, a free official gets #proOnly. The user
  // canister says who is Pro; if it can't be asked, the refresher works.
  public type WeakArticlesError = { #proOnly };

  // A query can't read canister environment variables, so the user
  // canister's id is copied here by a timer after install and each upgrade,
  // and by update calls (as the exam canister does).
  var USER_ID : ?Principal = null;

  func refreshEnv<system>() {
    switch (Env.canisterId<system>("user")) { case (?id) USER_ID := ?id; case null {} };
  };

  transient let _envTimer : Timer.TimerId = Timer.setTimer<system>(#seconds 0, func() : async () { refreshEnv<system>() });

  type UserAccess = actor { accessFor : shared query Principal -> async Result.Result<Billing.Access, { #notSibling }> };

  public shared composite query ({ caller }) func getMyWeakArticles(sportId : Text, limit : Nat) : async Result.Result<[(Text, Nat, Nat)], WeakArticlesError> {
    let access : Billing.Access = switch USER_ID {
      case (?id) {
        try {
          switch (await (actor (id.toText()) : UserAccess).accessFor(caller)) { case (#ok(a)) a; case (#err(_)) #paywallOff }
        } catch (_) { #paywallOff }
      };
      case null #paywallOff;
    };
    if (access == #free) return #err(#proOnly);
    let prefix = Principal.toText(caller) # "::";
    let byArticle = Map.empty<Text, AnswerTotals>();
    label scan for ((key, h) in Map.entriesFrom(history, Text.compare, prefix)) {
      if (not Text.startsWith(key, #text prefix)) break scan;
      switch (Map.get(questions, Text.compare, h.questionId)) {
        case (?q) {
          if (q.sportId == sportId) {
            let wrong = if (h.timesAnswered >= h.timesCorrect) h.timesAnswered - h.timesCorrect else 0;
            let prev = switch (Map.get(byArticle, Text.compare, q.articleId)) { case (?t) t; case null ({ answered = 0; wrong = 0 }) };
            Map.add(byArticle, Text.compare, q.articleId, { answered = prev.answered + h.timesAnswered; wrong = prev.wrong + wrong });
          };
        };
        case null {};
      };
    };
    let entries = List.empty<(Text, Nat, Nat)>();
    for ((articleId, t) in Map.entries(byArticle)) {
      if (t.wrong > 0) List.add(entries, (articleId, t.wrong, t.answered));
    };
    // Most misses first, then the worse miss rate.
    let sorted = List.sort<(Text, Nat, Nat)>(entries, func((_, wa, ta), (_, wb, tb)) {
      if (wa > wb) #less else if (wa < wb) #greater
      else if (wa * tb > wb * ta) #less else if (wa * tb < wb * ta) #greater else #equal
    });
    #ok(List.sliceToArray<(Text, Nat, Nat)>(sorted, 0, Nat.min(Nat.min(limit, 20), List.size(sorted))))
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

  // Question tags (issue #68): free-form labels an admin puts on questions
  // so a quiz can draw from just those, e.g. "rule-change:2026-27" for the
  // season's rule-changes quiz. Kept beside the questions rather than in
  // the stored Question type, so adding them needs no migration.
  public type TagError = { #notAdmin; #notFound; #tooMany };

  let questionTags : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>();
  transient let MAX_TAGS : Nat = 10;
  transient let MAX_TAG_CHARS : Nat = 100;

  func hasTag(questionId : Text, tag : ?Text) : Bool {
    switch tag {
      case null true;
      case (?t) switch (questionTags.get(Text.compare, questionId)) {
        case (?tags) tags.find(func x = x == t) != null;
        case null false;
      };
    }
  };

  /// Replaces a question's tags (an empty list removes them). Admin only.
  public shared ({ caller }) func setQuestionTags(questionId : Text, tags : [Text]) : async Result.Result<(), TagError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    if (questions.get(Text.compare, questionId) == null) return #err(#notFound);
    if (tags.size() > MAX_TAGS or tags.find(func t = t.size() > MAX_TAG_CHARS) != null) return #err(#tooMany);
    if (tags.size() == 0) questionTags.remove(Text.compare, questionId) else questionTags.add(Text.compare, questionId, tags);
    #ok(())
  };

  public query func getQuestionTags(questionId : Text) : async [Text] {
    switch (questionTags.get(Text.compare, questionId)) { case (?t) t; case null [] }
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
        if (matchesFilter(q, filter) and hasTag(q.id, pick.tag) and List.find<Question>(out, func(x) { x.id == q.id }) == null) List.add(matches, q);
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

  // ─── Question reports ──────────────────────────────────────────────────────
  //
  // Officials flag a question they think is wrong or unclear. Reports go to
  // an admin queue (the app's moderation page); an admin fixes the question
  // with addQuestion/content tools and closes the report. One open report
  // per official per question.

  public type ReportReason = { #WrongAnswer; #Unclear; #Outdated; #Typo; #Other };

  public type QuestionReport = {
    id         : Text;
    questionId : Text;
    reporter   : Principal;
    reason     : ReportReason;
    note       : Text;
    createdAt  : Int;
    resolved   : Bool;
    resolution : Text;
    resolvedAt : ?Int;
  };

  // "<questionId>|<reporter>" -> report.
  var questionReports : Map.Map<Text, QuestionReport> = Map.empty<Text, QuestionReport>();
  var openReportCount : Nat = 0;

  let MAX_REPORT_NOTE_CHARS : Nat = 500;
  let MAX_OPEN_REPORTS : Nat = 2_000;

  func reportKey(questionId : Text, reporter : Principal) : Text {
    questionId # "|" # Principal.toText(reporter)
  };

  public shared ({ caller }) func reportQuestion(questionId : Text, reason : ReportReason, note : Text) : async Result.Result<QuestionReport, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Text.size(note) > MAX_REPORT_NOTE_CHARS) return #err("Note is too long");
    if (Map.get(questions, Text.compare, questionId) == null) return #err("Question not found");
    let key = reportKey(questionId, caller);
    switch (Map.get(questionReports, Text.compare, key)) {
      case (?r) { if (not r.resolved) return #err("You already reported this question") };
      case null {};
    };
    if (openReportCount >= MAX_OPEN_REPORTS) return #err("The report queue is full, try again later");
    let r : QuestionReport = {
      id = key; questionId; reporter = caller; reason; note;
      createdAt = Time.now(); resolved = false; resolution = ""; resolvedAt = null;
    };
    Map.add(questionReports, Text.compare, key, r);
    openReportCount += 1;
    #ok(r)
  };

  /// Admin queue. Open reports only, or every report when `includeResolved`.
  public shared query ({ caller }) func listQuestionReports(includeResolved : Bool) : async Result.Result<[QuestionReport], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let out = List.empty<QuestionReport>();
    for ((_, r) in Map.entries(questionReports)) {
      if (includeResolved or not r.resolved) List.add(out, r);
    };
    #ok(List.toArray(out))
  };

  public shared ({ caller }) func resolveQuestionReport(id : Text, resolution : Text) : async Result.Result<QuestionReport, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    if (Text.size(resolution) > MAX_REPORT_NOTE_CHARS) return #err("Resolution is too long");
    switch (Map.get(questionReports, Text.compare, id)) {
      case null #err("Report not found");
      case (?r) {
        if (r.resolved) return #ok(r);
        let updated = { r with resolved = true; resolution; resolvedAt = ?Time.now() };
        Map.add(questionReports, Text.compare, id, updated);
        if (openReportCount > 0) openReportCount -= 1;
        #ok(updated)
      };
    }
  };

  /// Questions the caller has an open report on, so the app can show
  /// "Reported" instead of the button.
  public shared query ({ caller }) func myOpenReports(questionIds : [Text]) : async [Text] {
    Array.filter<Text>(Array.sliceToArray<Text>(questionIds, 0, Nat.min(questionIds.size(), 200)), func(qid) {
      switch (Map.get(questionReports, Text.compare, reportKey(qid, caller))) {
        case (?r) not r.resolved;
        case null false;
      }
    })
  };

  public shared query ({ caller }) func isAdminCaller() : async Bool { isAdmin(caller) };

  // ─── Account deletion ──────────────────────────────────────────────────────

  /// Called by the user canister when an official deletes their account:
  /// drops their spaced-repetition history and their question reports. The
  /// per-question answer totals stay: they are counts with no one's
  /// identity in them. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    let prefix = Principal.toText(p) # "::";
    let keys = List.empty<Text>();
    label scan for ((k, _) in Map.entriesFrom(history, Text.compare, prefix)) {
      if (not Text.startsWith(k, #text prefix)) break scan;
      List.add(keys, k);
    };
    for (k in List.values(keys)) Map.remove(history, Text.compare, k);
    let reports = List.empty<QuestionReport>();
    for ((_, r) in Map.entries(questionReports)) { if (r.reporter == p) List.add(reports, r) };
    for (r in List.values(reports)) {
      Map.remove(questionReports, Text.compare, r.id);
      if (not r.resolved and openReportCount > 0) openReportCount -= 1;
    };
    #ok(())
  };

  public query func metrics() : async { questionCount : Nat; openReports : Nat } {
    { questionCount = Map.size(questions); openReports = openReportCount }
  };
}
