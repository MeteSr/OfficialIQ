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
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Env "../lib/Env";
import Types "../lib/Types";
import Stored "Stored";
import Set "mo:core/Set";

persistent actor Ranking {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type UserStats = {
    principal     : Principal;
    displayName   : Text;
    sport         : Text;
    state         : Text;
    elo           : Float;
    streak        : Nat;
    bestStreak    : Nat;
    accuracy      : Float;
    avgElapsedSec : Float;
    examCount     : Nat;
    updatedAt     : Int;
  };

  public type EloSnapshot = {
    elo       : Float;
    accuracy  : Float;
    timestamp : Int;
  };

  public type LeaderboardEntry = {
    rank          : Nat;
    principal     : Principal;
    displayName   : Text;
    elo           : Float;
    accuracy      : Float;
    avgElapsedSec : Float;
    streak        : Nat;
  };

  public type SortKey = { #Elo; #Accuracy; #Speed };

  // Consecutive-day activity streak: extended once per calendar day the
  // first time that day's answered-question count reaches the threshold.
  public type DailyActivity = {
    currentStreak     : Nat;
    longestStreak     : Nat;
    activityDay       : Int; // day number (Time.now() / DAY_NS) answeredToday belongs to
    answeredToday     : Nat;
    lastQualifyingDay : Int; // day number the streak was last extended; -1 if never
  };

  public type SkillCounters = {
    casebookCorrect : Nat;
    casebookTotal   : Nat;
    speedStreak     : Nat; // current consecutive correct-and-under-10s answers
    bestSpeedStreak : Nat;
  };

  public type Group = {
    id          : Text;
    name        : Text;
    sport       : Text;
    state       : Text;
    isPrivate   : Bool;
    owner       : Principal;
    memberCount : Nat;
    createdAt   : Int;
  };

  public type GroupChallenge = {
    id        : Text;
    groupId   : Text;
    title     : Text;
    deadline  : Int;
    createdAt : Int;
  };

  public type GroupLeaderboardEntry = {
    rank           : Nat;
    principal      : Principal;
    displayName    : Text;
    weeklyAccuracy : Float;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  // Stored stats (Stored.mo); the API returns them through view().
  type Stats = Stored.Stats;
  var stats : Map.Map<Principal, Stats> = Map.empty<Principal, Stats>();

  /// Stored stats as the API returns them. The identity while the two types
  /// have the same fields; when one changes, the compiler asks here.
  func view(s : Stats) : UserStats = s;
  func viewOpt(s : ?Stats) : ?UserStats = switch s { case (?x) ?view(x); case null null };

  var friends : Map.Map<Principal, [Principal]> = Map.empty<Principal, [Principal]>();

  var examHistory : Map.Map<Principal, [EloSnapshot]> = Map.empty<Principal, [EloSnapshot]>();

  var dailyActivity : Map.Map<Principal, DailyActivity> = Map.empty<Principal, DailyActivity>();

  var skillCounters : Map.Map<Principal, SkillCounters> = Map.empty<Principal, SkillCounters>();

  var groups          : Map.Map<Text, Group> = Map.empty<Text, Group>();
  var groupMembers    : Map.Map<Text, [Principal]> = Map.empty<Text, [Principal]>();
  var myGroupIds      : Map.Map<Principal, [Text]> = Map.empty<Principal, [Text]>();
  var groupChallenges : Map.Map<Text, [GroupChallenge]> = Map.empty<Text, [GroupChallenge]>();

  var nextGroupId          : Nat = 0;
  var nextGroupChallengeId : Nat = 0;

  let MAX_HISTORY : Nat = 60;
  let MAX_NAME_CHARS : Nat = 100;
  let MAX_QUESTIONS_PER_CALL : Nat = 200;
  let DAY_NS : Int = 86_400_000_000_000;

  var adminPrincipal : ?Principal = null;

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

  // Own principal for the scheduled push relay: it may read and ack pending
  // push events, nothing else (see user canister's setPushRelay).
  var pushRelayPrincipal : ?Principal = null;

  public shared ({ caller }) func setPushRelay(p : ?Principal) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    pushRelayPrincipal := p;
    #ok(())
  };

  func canRelayPush(p : Principal) : Bool {
    isAdmin(p) or (switch pushRelayPrincipal { case (?r) r == p; case null false })
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  func sortByKey(pool : [Stats], key : SortKey) : [Stats] {
    Array.sort<Stats>(pool, func(a, b) {
      switch key {
        case (#Elo) {
          if (a.elo > b.elo) #less else if (a.elo < b.elo) #greater else #equal
        };
        case (#Accuracy) {
          if (a.accuracy > b.accuracy) #less else if (a.accuracy < b.accuracy) #greater else #equal
        };
        case (#Speed) {
          // Lower average time per question ranks first; treat "never answered" (0.0) as slowest.
          let aTime = if (a.avgElapsedSec <= 0.0) Int.toFloat(1_000_000) else a.avgElapsedSec;
          let bTime = if (b.avgElapsedSec <= 0.0) Int.toFloat(1_000_000) else b.avgElapsedSec;
          if (aTime < bTime) #less else if (aTime > bTime) #greater else #equal
        };
      }
    })
  };

  func toEntries(sorted : [Stats], limit : Nat) : [LeaderboardEntry] {
    let cap = if (limit < sorted.size()) limit else sorted.size();
    let buf = VarArray.repeat<LeaderboardEntry>({
      rank = 0; principal = Principal.fromText("2vxsx-fae"); displayName = "";
      elo = 0.0; accuracy = 0.0; avgElapsedSec = 0.0; streak = 0;
    }, cap);
    var i = 0;
    while (i < cap) {
      let s = sorted[i];
      buf[i] := { rank = i + 1; principal = s.principal; displayName = s.displayName;
        elo = s.elo; accuracy = s.accuracy; avgElapsedSec = s.avgElapsedSec; streak = s.streak };
      i += 1;
    };
    VarArray.toArray<LeaderboardEntry>(buf)
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  // Speed multiplier applied to the ELO delta: rewards fast-and-correct results
  // and dampens slow-but-correct ones. Thresholds are absolute (seconds per
  // question) since this call doesn't have the exam's configured secPerQ.
  func speedMultiplier(avgElapsedSec : Nat) : Float {
    if (avgElapsedSec <= 15) 1.15
    else if (avgElapsedSec >= 45) 0.85
    else 1.0
  };

  // Client-reported scores are no longer accepted: results come from the
  // exam canister's grading (claimExamResult). Kept so older clients fail
  // loudly instead of with a missing-method error.
  public shared func recordExamResult(
    _score : Nat, _questionCount : Nat, _displayName : Text, _sport : Text, _state : Text, _avgElapsedSec : Nat,
  ) : async () {
    Runtime.trap("Exam results are graded by OfficialIQ now. Update the app.")
  };

  // ─── Graded results (from the exam canister) ───────────────────────────────


  // Exam sessions already counted, so one good session can't be claimed twice.
  var claimedSessions : Set.Set<Text> = Set.empty<Text>();

  let MIN_RANKED_QUESTIONS : Nat = 5;

  /// Counts a finished, canister-graded exam session toward the caller's
  /// ELO, accuracy and streak. The score comes from the exam canister, never
  /// from the browser; each session counts once. The exam canister now
  /// pushes results itself (recordGradedSession), so the app no longer calls
  /// this; kept for older apps. displayName and state are taken from the
  /// user canister, and the arguments only stand in when it has no profile.
  public shared ({ caller }) func claimExamResult(sessionId : Text, displayName : Text, state : Text) : async Result.Result<UserStats, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Text.size(displayName) > MAX_NAME_CHARS or Text.size(state) > MAX_NAME_CHARS) return #err("Field too long");
    let examId = switch (Env.canisterId<system>("exam")) { case (?id) id; case null return #err("Exam canister not configured") };
    let exam = actor (Principal.toText(examId)) : Types.ExamResults;
    let r = switch (await exam.gradedResult(sessionId)) {
      case (?r) r;
      case null return #err("No finished graded exam with that id");
    };
    let (name, st) = await* nameAndState<system>(caller, displayName, state);
    // Re-checked after the awaits: another call may have claimed it meanwhile.
    if (r.owner != caller) return #err("Not your exam");
    if (Set.contains(claimedSessions, Text.compare, sessionId)) return #err("Already counted");
    if (r.questionCount < MIN_RANKED_QUESTIONS) return #err("Ranked exams need at least " # Nat.toText(MIN_RANKED_QUESTIONS) # " questions");
    Set.add(claimedSessions, Text.compare, sessionId);
    // Older apps don't send per-answer difficulty: rate every question as
    // Intermediate.
    let outcomes = Array.tabulate<(Bool, ?Types.Difficulty)>(r.questionCount, func(i) { (i < r.correct, null) });
    #ok(view(applyExamResult(caller, r.score, outcomes, name, r.sportId, st, r.avgElapsedSec)))
  };

  // Sessions the exam canister has pushed (recordGradedSession), so a retry
  // doesn't count a session's answers toward the streak twice.
  var pushedSessions : Set.Set<Text> = Set.empty<Text>();

  /// Called by the exam canister when a quiz or exam finishes: counts it
  /// toward ELO (as claimExamResult, once per session and only with enough
  /// questions), the daily streak and the skill counters. Safe to repeat.
  public shared ({ caller }) func recordGradedSession(r : Types.GradedResult, answers : [Types.AnswerSignal]) : async Result.Result<(), Text> {
    switch (Env.canisterId<system>("exam")) {
      case (?id) { if (caller != id) return #err("Exam canister only") };
      case null return #err("Exam canister not configured");
    };
    if (answers.size() > MAX_QUESTIONS_PER_CALL) return #err("Too many answers");
    if (Set.contains(pushedSessions, Text.compare, r.id)) return #ok(());
    let (name, st) = await* nameAndState<system>(r.owner, "Official", "");
    // Re-checked after the await.
    if (Set.contains(pushedSessions, Text.compare, r.id)) return #ok(());
    Set.add(pushedSessions, Text.compare, r.id);
    if (r.questionCount >= MIN_RANKED_QUESTIONS and not Set.contains(claimedSessions, Text.compare, r.id)) {
      Set.add(claimedSessions, Text.compare, r.id);
      // Unanswered questions count as wrong, at Intermediate.
      let outcomes = Array.tabulate<(Bool, ?Types.Difficulty)>(r.questionCount, func(i) {
        if (i < answers.size()) (answers[i].isCorrect, answers[i].difficulty) else (false, null)
      });
      ignore applyExamResult(r.owner, r.score, outcomes, name, r.sportId, st, r.avgElapsedSec);
    };
    ignore countAnswered(r.owner, r.answered);
    for (a in answers.values()) countSignal(r.owner, a.isCorrect, a.elapsedSec, a.isCasebook);
    #ok(())
  };

  type UserProfiles = actor {
    getPublicProfile : shared query Principal -> async ?{ displayName : Text; state : Text };
  };

  // An official's name and state as the user canister has them (finding 7
  // of the Nov 2026 review: these used to come from the browser). Falls
  // back to what the leaderboard already shows, then to the given values.
  func nameAndState<system>(p : Principal, fallbackName : Text, fallbackState : Text) : async* (Text, Text) {
    let fromStats = switch (Map.get(stats, Principal.compare, p)) {
      case (?s) (s.displayName, s.state);
      case null (fallbackName, fallbackState);
    };
    switch (Env.canisterId<system>("user")) {
      case null fromStats;
      case (?uid) {
        try {
          switch (await (actor (Principal.toText(uid)) : UserProfiles).getPublicProfile(p)) {
            case (?pr) (pr.displayName, pr.state);
            case null fromStats;
          }
        } catch (_) fromStats;
      };
    }
  };

  /// Called by the user canister when an official renames themself or
  /// changes state, so the leaderboards don't keep showing the old values
  /// until their next exam.
  public shared ({ caller }) func profileChanged(p : Principal, displayName : Text, state : Text) : async () {
    switch (Env.canisterId<system>("user")) {
      case (?id) { if (caller != id) return };
      case null return;
    };
    if (Text.size(displayName) > MAX_NAME_CHARS or Text.size(state) > MAX_NAME_CHARS) return;
    switch (Map.get(stats, Principal.compare, p)) {
      case (?s) Map.add(stats, Principal.compare, p, { s with displayName; state });
      case null {};
    };
  };

  // ─── Rating ─────────────────────────────────────────────────────────────────
  //
  // Elo against the questions: each question has a rating from its
  // difficulty, and an official's rating moves by how they did against what
  // their rating predicted. Beating Expert questions earns more than beating
  // Beginner ones, and missing a Beginner question costs more. A session
  // moves the rating by at most K (scaled by the speed multiplier). Against
  // Intermediate questions at 1000 this is the old (accuracy - 0.5) * 32.

  let K_FACTOR : Float = 32.0;

  func questionRating(d : ?Types.Difficulty) : Float {
    switch d {
      case (?#Beginner) 850.0;
      case (?#Intermediate or null) 1000.0;
      case (?#Advanced) 1150.0;
      case (?#Expert) 1300.0;
    }
  };

  /// The probability an official rated `player` answers a question rated
  /// `question` correctly.
  func expected(player : Float, question : Float) : Float {
    1.0 / (1.0 + Float.pow(10.0, (question - player) / 400.0))
  };

  func ratingDelta(player : Float, outcomes : [(Bool, ?Types.Difficulty)], avgElapsedSec : Nat) : Float {
    if (outcomes.size() == 0) return 0.0;
    var surprise = 0.0;
    for ((correct, d) in outcomes.values()) {
      surprise += (if correct 1.0 else 0.0) - expected(player, questionRating(d));
    };
    K_FACTOR * surprise / Int.toFloat(outcomes.size()) * speedMultiplier(avgElapsedSec)
  };

  func applyExamResult(caller : Principal, score : Nat, outcomes : [(Bool, ?Types.Difficulty)], displayName : Text, sport : Text, state : Text, avgElapsedSec : Nat) : Stats {
    let prev : Stats = switch (Map.get(stats, Principal.compare, caller)) {
      case (?s) s;
      case null {
        { principal = caller; displayName; sport; state;
          elo = 1000.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0 }
      };
    };
    let acc         = Int.toFloat(score) / 100.0;
    let newCount    = prev.examCount + 1;
    let newAcc      = (prev.accuracy * Int.toFloat(prev.examCount) + acc) / Int.toFloat(newCount);
    let newAvgTime  = (prev.avgElapsedSec * Int.toFloat(prev.examCount) + Int.toFloat(avgElapsedSec)) / Int.toFloat(newCount);
    let delta       = ratingDelta(prev.elo, outcomes, avgElapsedSec);
    let newElo      = if (prev.elo + delta < 0.0) 0.0 else prev.elo + delta;
    let newStreak   = if (score >= 80) prev.streak + 1 else 0;
    let newBest     = if (newStreak > prev.bestStreak) newStreak else prev.bestStreak;
    Map.add(stats, Principal.compare, caller, {
      principal     = caller;
      displayName   = displayName;
      sport;
      state;
      elo           = newElo;
      streak        = newStreak;
      bestStreak    = newBest;
      accuracy      = newAcc;
      avgElapsedSec = newAvgTime;
      examCount     = newCount;
      updatedAt     = Time.now();
    });

    let prevHistory = switch (Map.get(examHistory, Principal.compare, caller)) { case (?h) h; case null [] };
    let appended = Array.concat<EloSnapshot>(prevHistory, [{ elo = newElo; accuracy = newAcc; timestamp = Time.now() }]);
    let trimmed = if (appended.size() > MAX_HISTORY)
      Array.sliceToArray<EloSnapshot>(appended, appended.size() - MAX_HISTORY, appended.size())
      else appended;
    Map.add(examHistory, Principal.compare, caller, trimmed);
    switch (Map.get(stats, Principal.compare, caller)) { case (?st) st; case null Runtime.unreachable() }
  };

  public shared ({ caller }) func addFriend(friend : Principal) : async Result.Result<(), Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (caller == friend) return #err("Cannot friend yourself");
    let existing = switch (Map.get(friends, Principal.compare, caller)) { case (?f) f; case null [] };
    let already = Array.find<Principal>(existing, func(p) { p == friend }) != null;
    if (already) return #err("Already friends");
    Map.add(friends, Principal.compare, caller, Array.concat<Principal>(existing, [friend]));
    #ok(())
  };

  public shared ({ caller }) func removeFriend(friend : Principal) : async Result.Result<(), Text> {
    let existing = switch (Map.get(friends, Principal.compare, caller)) { case (?f) f; case null [] };
    let filtered = Array.filter<Principal>(existing, func(p) { p != friend });
    if (filtered.size() == existing.size()) return #err("Not friends");
    Map.add(friends, Principal.compare, caller, filtered);
    #ok(())
  };

  // ─── Daily streak + skill badges ───────────────────────────────────────────

  func defaultActivity() : DailyActivity {
    { currentStreak = 0; longestStreak = 0; activityDay = 0; answeredToday = 0; lastQualifyingDay = -1 }
  };

  // Server-side mirror of HomePage.tsx's STREAK_MILESTONES — the frontend
  // toast is detected client-side against a localStorage watermark (fast,
  // but only fires if the app happens to be open); this queue is what lets
  // a real push notification (issue #28) fire even when it isn't, via
  // scripts/send-pending-push.mjs polling getPendingPushEvents().
  let PUSH_MILESTONES : [Nat] = [7, 30, 100];

  var pendingPushEvents : Map.Map<Principal, [Nat]> = Map.empty<Principal, [Nat]>();

  func queuePushEvent(p : Principal, milestone : Nat) {
    let existing = switch (Map.get(pendingPushEvents, Principal.compare, p)) { case (?e) e; case null [] };
    if (Array.find<Nat>(existing, func(m) { m == milestone }) == null) {
      Map.add(pendingPushEvents, Principal.compare, p, Array.concat<Nat>(existing, [milestone]));
    };
  };

  // Called once per quiz completion with that session's answered-question
  // count. A day first crosses the >=5 threshold exactly once; from then on
  // extra answers that day just accumulate in answeredToday for display.
  public shared ({ caller }) func recordQuestionsAnswered(count : Nat) : async DailyActivity {
    if (Principal.isAnonymous(caller)) Runtime.trap("Must be authenticated");
    if (count > MAX_QUESTIONS_PER_CALL) Runtime.trap("Count out of range");
    countAnswered(caller, count)
  };

  func countAnswered(caller : Principal, count : Nat) : DailyActivity {
    let today = Time.now() / DAY_NS;
    let prev = switch (Map.get(dailyActivity, Principal.compare, caller)) { case (?a) a; case null defaultActivity() };
    let answeredToday = if (prev.activityDay == today) prev.answeredToday + count else count;

    var currentStreak = prev.currentStreak;
    var lastQualifyingDay = prev.lastQualifyingDay;
    if (answeredToday >= 5 and prev.lastQualifyingDay != today) {
      currentStreak := if (prev.lastQualifyingDay == today - 1) prev.currentStreak + 1 else 1;
      lastQualifyingDay := today;
      if (Array.find<Nat>(PUSH_MILESTONES, func(m) { m == currentStreak }) != null) {
        queuePushEvent(caller, currentStreak);
      };
    };
    let longestStreak = if (currentStreak > prev.longestStreak) currentStreak else prev.longestStreak;

    let updated : DailyActivity = { currentStreak; longestStreak; activityDay = today; answeredToday; lastQualifyingDay };
    Map.add(dailyActivity, Principal.compare, caller, updated);
    updated
  };

  // Per-answer signal used for the "Speed Demon" and "Casebook King" badges.
  public shared ({ caller }) func recordAnswerSignal(isCorrect : Bool, elapsedSec : Nat, isCasebook : Bool) : async () {
    if (Principal.isAnonymous(caller)) Runtime.trap("Must be authenticated");
    countSignal(caller, isCorrect, elapsedSec, isCasebook);
  };

  func countSignal(caller : Principal, isCorrect : Bool, elapsedSec : Nat, isCasebook : Bool) {
    let prev = switch (Map.get(skillCounters, Principal.compare, caller)) {
      case (?c) c;
      case null { { casebookCorrect = 0; casebookTotal = 0; speedStreak = 0; bestSpeedStreak = 0 } };
    };
    let casebookCorrect = prev.casebookCorrect + (if (isCasebook and isCorrect) 1 else 0);
    let casebookTotal   = prev.casebookTotal + (if (isCasebook) 1 else 0);
    let speedStreak      = if (isCorrect and elapsedSec < 10) prev.speedStreak + 1 else 0;
    let bestSpeedStreak  = if (speedStreak > prev.bestSpeedStreak) speedStreak else prev.bestSpeedStreak;
    Map.add(skillCounters, Principal.compare, caller, { casebookCorrect; casebookTotal; speedStreak; bestSpeedStreak });
  };

  // ─── Study groups ───────────────────────────────────────────────────────────

  public shared ({ caller }) func createGroup(name : Text, sport : Text, state : Text, isPrivate : Bool) : async Result.Result<Group, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Text.size(name) > MAX_NAME_CHARS or Text.size(sport) > MAX_NAME_CHARS or Text.size(state) > MAX_NAME_CHARS) return #err("Field too long");
    let id = "grp" # Nat.toText(nextGroupId);
    nextGroupId += 1;
    let g : Group = { id; name; sport; state; isPrivate; owner = caller; memberCount = 1; createdAt = Time.now() };
    Map.add(groups, Text.compare, id, g);
    Map.add(groupMembers, Text.compare, id, [caller]);
    let mine = switch (Map.get(myGroupIds, Principal.compare, caller)) { case (?m) m; case null [] };
    Map.add(myGroupIds, Principal.compare, caller, Array.concat<Text>(mine, [id]));
    #ok(g)
  };

  // Joining a private group requires knowing its id (e.g. a shared link) —
  // "private" controls listing visibility, not a separate access-control gate.
  public shared ({ caller }) func joinGroup(groupId : Text) : async Result.Result<Group, Text> {
    switch (Map.get(groups, Text.compare, groupId)) {
      case null #err("Group not found");
      case (?g) {
        let members = switch (Map.get(groupMembers, Text.compare, groupId)) { case (?m) m; case null [] };
        if (Array.find<Principal>(members, func(p) { p == caller }) != null) return #err("Already a member");
        let newMembers = Array.concat<Principal>(members, [caller]);
        Map.add(groupMembers, Text.compare, groupId, newMembers);
        let updated = { g with memberCount = newMembers.size() };
        Map.add(groups, Text.compare, groupId, updated);
        let mine = switch (Map.get(myGroupIds, Principal.compare, caller)) { case (?m) m; case null [] };
        Map.add(myGroupIds, Principal.compare, caller, Array.concat<Text>(mine, [groupId]));
        #ok(updated)
      };
    }
  };

  public shared ({ caller }) func leaveGroup(groupId : Text) : async Result.Result<(), Text> {
    switch (Map.get(groups, Text.compare, groupId)) {
      case null #err("Group not found");
      case (?g) {
        let members = switch (Map.get(groupMembers, Text.compare, groupId)) { case (?m) m; case null [] };
        let filtered = Array.filter<Principal>(members, func(p) { p != caller });
        if (filtered.size() == members.size()) return #err("Not a member");
        Map.add(groupMembers, Text.compare, groupId, filtered);
        Map.add(groups, Text.compare, groupId, { g with memberCount = filtered.size() });
        let mine = switch (Map.get(myGroupIds, Principal.compare, caller)) { case (?m) m; case null [] };
        Map.add(myGroupIds, Principal.compare, caller, Array.filter<Text>(mine, func(id) { id != groupId }));
        #ok(())
      };
    }
  };

  public shared ({ caller }) func postGroupChallenge(groupId : Text, title : Text, deadline : Int) : async Result.Result<GroupChallenge, Text> {
    switch (Map.get(groups, Text.compare, groupId)) {
      case null #err("Group not found");
      case (?g) {
        if (g.owner != caller) return #err("Only the group owner can post a challenge");
        if (Text.size(title) > 200) return #err("Title is too long");
        let id = "gch" # Nat.toText(nextGroupChallengeId);
        nextGroupChallengeId += 1;
        let ch : GroupChallenge = { id; groupId; title; deadline; createdAt = Time.now() };
        let existing = switch (Map.get(groupChallenges, Text.compare, groupId)) { case (?c) c; case null [] };
        Map.add(groupChallenges, Text.compare, groupId, Array.concat<GroupChallenge>(existing, [ch]));
        #ok(ch)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getFriendPrincipals() : async [Principal] {
    switch (Map.get(friends, Principal.compare, caller)) { case (?f) f; case null [] }
  };

  // Full stats are private to their owner. Everyone else sees only the
  // fields the public leaderboards already show (getPublicStats).
  public shared query ({ caller }) func getStats(p : Principal) : async ?UserStats {
    if (caller != p and not isAdmin(caller)) return null;
    viewOpt(Map.get(stats, Principal.compare, p))
  };

  public type PublicStats = {
    principal     : Principal;
    displayName   : Text;
    elo           : Float;
    accuracy      : Float;
    avgElapsedSec : Float;
    streak        : Nat;
  };

  public query func getPublicStats(p : Principal) : async ?PublicStats {
    switch (Map.get(stats, Principal.compare, p)) {
      case (?s) ?{ principal = s.principal; displayName = s.displayName; elo = s.elo;
                   accuracy = s.accuracy; avgElapsedSec = s.avgElapsedSec; streak = s.streak };
      case null null;
    }
  };

  public query func getNational(sport : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let buf = VarArray.repeat<Stats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, Map.size(stats));
    var i = 0;
    for ((_, s) in Map.entries(stats)) {
      if (s.sport == sport) { buf[i] := s; i += 1 };
    };
    let pool = VarArray.sliceToArray<Stats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public query func getState(sport : Text, state : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let buf = VarArray.repeat<Stats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, Map.size(stats));
    var i = 0;
    for ((_, s) in Map.entries(stats)) {
      if (s.sport == sport and s.state == state) { buf[i] := s; i += 1 };
    };
    let pool = VarArray.sliceToArray<Stats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public shared query ({ caller }) func getFriends(sport : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let myFriends = switch (Map.get(friends, Principal.compare, caller)) { case (?f) f; case null [] };
    let all = Array.concat<Principal>(myFriends, [caller]);
    let buf = VarArray.repeat<Stats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, all.size());
    var i = 0;
    for (p in all.values()) {
      switch (Map.get(stats, Principal.compare, p)) {
        case (?s) { if (s.sport == sport) { buf[i] := s; i += 1 } };
        case null {};
      };
    };
    let pool = VarArray.sliceToArray<Stats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public shared query ({ caller }) func getMyStats() : async ?UserStats {
    viewOpt(Map.get(stats, Principal.compare, caller))
  };

  public shared query ({ caller }) func getMyEloHistory() : async [EloSnapshot] {
    switch (Map.get(examHistory, Principal.compare, caller)) { case (?h) h; case null [] }
  };

  public shared query ({ caller }) func getDailyStreak() : async DailyActivity {
    let today = Time.now() / DAY_NS;
    switch (Map.get(dailyActivity, Principal.compare, caller)) {
      case null defaultActivity();
      case (?a) {
        // A gap of more than one day since the streak last extended means it's
        // broken even without a new mutation call — reflect that at read time.
        if (a.lastQualifyingDay != -1 and today - a.lastQualifyingDay > 1) ({ a with currentStreak = 0 })
        else a
      };
    }
  };

  public shared query ({ caller }) func getSkillCounters() : async SkillCounters {
    switch (Map.get(skillCounters, Principal.compare, caller)) {
      case (?c) c;
      case null { { casebookCorrect = 0; casebookTotal = 0; speedStreak = 0; bestSpeedStreak = 0 } };
    }
  };

  public query func listPublicGroups(sport : Text) : async [Group] {
    let buf = List.empty<Group>();
    for ((_, g) in Map.entries(groups)) {
      if (g.sport == sport and not g.isPrivate) { List.add(buf, g) };
    };
    List.toArray<Group>(buf)
  };

  public shared query ({ caller }) func getMyGroups() : async [Group] {
    let ids = switch (Map.get(myGroupIds, Principal.compare, caller)) { case (?m) m; case null [] };
    Array.filterMap<Text, Group>(ids, func(id) { Map.get(groups, Text.compare, id) })
  };

  public query func getGroup(groupId : Text) : async ?Group {
    Map.get(groups, Text.compare, groupId)
  };

  public query func getGroupChallenges(groupId : Text) : async [GroupChallenge] {
    switch (Map.get(groupChallenges, Text.compare, groupId)) { case (?c) c; case null [] }
  };

  func weeklyAccuracy(p : Principal) : Float {
    let history = switch (Map.get(examHistory, Principal.compare, p)) { case (?h) h; case null [] };
    let cutoff = Time.now() - 7 * DAY_NS;
    let recent = Array.filter<EloSnapshot>(history, func(s) { s.timestamp >= cutoff });
    if (recent.size() == 0) {
      switch (Map.get(stats, Principal.compare, p)) { case (?s) s.accuracy; case null 0.0 }
    } else {
      var sum = 0.0;
      for (s in recent.values()) { sum += s.accuracy };
      sum / Int.toFloat(recent.size())
    }
  };

  // Members ranked by accuracy averaged over exams from the last 7 days
  // (falling back to all-time accuracy for members with no recent exams).
  public query func getGroupLeaderboard(groupId : Text) : async [GroupLeaderboardEntry] {
    let members = switch (Map.get(groupMembers, Text.compare, groupId)) { case (?m) m; case null [] };
    let buf = List.empty<GroupLeaderboardEntry>();
    for (p in members.values()) {
      let displayName = switch (Map.get(stats, Principal.compare, p)) { case (?s) s.displayName; case null "Member" };
      List.add(buf, { rank = 0; principal = p; displayName; weeklyAccuracy = weeklyAccuracy(p) });
    };
    let sorted = Array.sort<GroupLeaderboardEntry>(List.toArray<GroupLeaderboardEntry>(buf), func(a, b) {
      if (a.weeklyAccuracy > b.weeklyAccuracy) #less else if (a.weeklyAccuracy < b.weeklyAccuracy) #greater else #equal
    });
    Array.mapEntries<GroupLeaderboardEntry, GroupLeaderboardEntry>(sorted, func(e, i) { ({ e with rank = i + 1 }) })
  };

  // ─── Push notification relay support (issue #28) ───────────────────────────
  //
  // Motoko/the IC has no ECDSA-P256 signing primitive usable for Web Push's
  // VAPID JWTs (threshold ECDSA is secp256k1, a different curve) — real
  // encrypted, signed sends have to happen off-chain, via the well-tested
  // `web-push` npm library. This queue is the handoff point: the canister
  // decides *when* a push is due (server-side, tamper-proof, fires even if
  // the app is closed for days), scripts/send-pending-push.mjs decides *how*
  // to actually deliver it.

  public shared ({ caller }) func getPendingPushEvents() : async Result.Result<[(Principal, [Nat])], Text> {
    if (not canRelayPush(caller)) return #err("Admin only");
    let buf = List.empty<(Principal, [Nat])>();
    for ((p, events) in Map.entries(pendingPushEvents)) {
      if (events.size() > 0) List.add(buf, (p, events));
    };
    #ok(List.toArray(buf))
  };

  public shared ({ caller }) func ackPushEvent(p : Principal, milestone : Nat) : async Result.Result<(), Text> {
    if (not canRelayPush(caller)) return #err("Admin only");
    let existing = switch (Map.get(pendingPushEvents, Principal.compare, p)) { case (?e) e; case null [] };
    Map.add(pendingPushEvents, Principal.compare, p, Array.filter<Nat>(existing, func(m) { m != milestone }));
    #ok(())
  };

  // ─── Account deletion ──────────────────────────────────────────────────────

  /// Called by the user canister when an official deletes their account:
  /// drops their stats, history, streaks, friends and push events, takes
  /// them off other people's friend lists and out of groups, and deletes the
  /// groups they own. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    Map.remove(stats, Principal.compare, p);
    Map.remove(examHistory, Principal.compare, p);
    Map.remove(dailyActivity, Principal.compare, p);
    Map.remove(skillCounters, Principal.compare, p);
    Map.remove(pendingPushEvents, Principal.compare, p);
    Map.remove(friends, Principal.compare, p);
    // Others who added them as a friend. One pass over the friend lists,
    // once per deleted account.
    let friendOf = List.empty<(Principal, [Principal])>();
    for ((owner, list) in Map.entries(friends)) {
      if (Array.find<Principal>(list, func(f) { f == p }) != null) {
        List.add(friendOf, (owner, Array.filter<Principal>(list, func(f) { f != p })));
      };
    };
    for ((owner, list) in List.values(friendOf)) Map.add(friends, Principal.compare, owner, list);

    let mine = switch (Map.take(myGroupIds, Principal.compare, p)) { case (?m) m; case null [] };
    for (groupId in mine.values()) {
      switch (Map.get(groups, Text.compare, groupId)) {
        case null {};
        case (?g) {
          let members = switch (Map.get(groupMembers, Text.compare, groupId)) { case (?m) m; case null [] };
          if (g.owner == p) {
            // Their group goes with them.
            for (m in members.values()) {
              switch (Map.get(myGroupIds, Principal.compare, m)) {
                case (?ids) Map.add(myGroupIds, Principal.compare, m, Array.filter<Text>(ids, func(id) { id != groupId }));
                case null {};
              };
            };
            Map.remove(groups, Text.compare, groupId);
            Map.remove(groupMembers, Text.compare, groupId);
            Map.remove(groupChallenges, Text.compare, groupId);
          } else {
            let kept = Array.filter<Principal>(members, func(m) { m != p });
            Map.add(groupMembers, Text.compare, groupId, kept);
            Map.add(groups, Text.compare, groupId, { g with memberCount = kept.size() });
          };
        };
      };
    };
    #ok(())
  };

  public query func metrics() : async { userCount : Nat } {
    { userCount = Map.size(stats) }
  };
}
