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

  var stats : Map.Map<Principal, UserStats> = Map.empty<Principal, UserStats>();

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
  let DAY_NS : Int = 86_400_000_000_000;

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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  func sortByKey(pool : [UserStats], key : SortKey) : [UserStats] {
    Array.sort<UserStats>(pool, func(a, b) {
      switch key {
        case (#Elo) {
          if (a.elo > b.elo) #less else if (a.elo < b.elo) #greater else #equal
        };
        case (#Accuracy) {
          if (a.accuracy > b.accuracy) #less else if (a.accuracy < b.accuracy) #greater else #equal
        };
        case (#Speed) {
          // Lower average time per question ranks first; treat "never answered" (0.0) as slowest.
          let aTime = if (a.avgElapsedSec <= 0.0) Float.fromInt(1_000_000) else a.avgElapsedSec;
          let bTime = if (b.avgElapsedSec <= 0.0) Float.fromInt(1_000_000) else b.avgElapsedSec;
          if (aTime < bTime) #less else if (aTime > bTime) #greater else #equal
        };
      }
    })
  };

  func toEntries(sorted : [UserStats], limit : Nat) : [LeaderboardEntry] {
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

  public shared ({ caller }) func recordExamResult(
    score         : Nat,
    questionCount : Nat,
    displayName   : Text,
    sport         : Text,
    state         : Text,
    avgElapsedSec : Nat,
  ) : async () {
    let prev : UserStats = switch (Map.get(stats, Principal.compare, caller)) {
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
    let delta       = (acc - 0.5) * 32.0 * speedMultiplier(avgElapsedSec);
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
  };

  public shared ({ caller }) func addFriend(friend : Principal) : async Result.Result<(), Text> {
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

  public query func getStats(p : Principal) : async ?UserStats {
    Map.get(stats, Principal.compare, p)
  };

  public query func getNational(sport : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let buf = VarArray.repeat<UserStats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, Map.size(stats));
    var i = 0;
    for ((_, s) in Map.entries(stats)) {
      if (s.sport == sport) { buf[i] := s; i += 1 };
    };
    let pool = VarArray.sliceToArray<UserStats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public query func getState(sport : Text, state : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let buf = VarArray.repeat<UserStats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, Map.size(stats));
    var i = 0;
    for ((_, s) in Map.entries(stats)) {
      if (s.sport == sport and s.state == state) { buf[i] := s; i += 1 };
    };
    let pool = VarArray.sliceToArray<UserStats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public shared query ({ caller }) func getFriends(sport : Text, limit : Nat, sortBy : SortKey) : async [LeaderboardEntry] {
    let myFriends = switch (Map.get(friends, Principal.compare, caller)) { case (?f) f; case null [] };
    let all = Array.concat<Principal>(myFriends, [caller]);
    let buf = VarArray.repeat<UserStats>({
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; bestStreak = 0; accuracy = 0.0; avgElapsedSec = 0.0; examCount = 0; updatedAt = 0;
    }, all.size());
    var i = 0;
    for (p in all.vals()) {
      switch (Map.get(stats, Principal.compare, p)) {
        case (?s) { if (s.sport == sport) { buf[i] := s; i += 1 } };
        case null {};
      };
    };
    let pool = VarArray.sliceToArray<UserStats>(buf, 0, i);
    toEntries(sortByKey(pool, sortBy), limit)
  };

  public shared query ({ caller }) func getMyStats() : async ?UserStats {
    Map.get(stats, Principal.compare, caller)
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
      for (s in recent.vals()) { sum += s.accuracy };
      sum / Float.fromInt(recent.size())
    }
  };

  // Members ranked by accuracy averaged over exams from the last 7 days
  // (falling back to all-time accuracy for members with no recent exams).
  public query func getGroupLeaderboard(groupId : Text) : async [GroupLeaderboardEntry] {
    let members = switch (Map.get(groupMembers, Text.compare, groupId)) { case (?m) m; case null [] };
    let buf = List.empty<GroupLeaderboardEntry>();
    for (p in members.vals()) {
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
    if (not isAdmin(caller)) return #err("Admin only");
    let buf = List.empty<(Principal, [Nat])>();
    for ((p, events) in Map.entries(pendingPushEvents)) {
      if (events.size() > 0) List.add(buf, (p, events));
    };
    #ok(List.toArray(buf))
  };

  public shared ({ caller }) func ackPushEvent(p : Principal, milestone : Nat) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let existing = switch (Map.get(pendingPushEvents, Principal.compare, p)) { case (?e) e; case null [] };
    Map.add(pendingPushEvents, Principal.compare, p, Array.filter<Nat>(existing, func(m) { m != milestone }));
    #ok(())
  };

  public query func metrics() : async { userCount : Nat } {
    { userCount = Map.size(stats) }
  };
}
