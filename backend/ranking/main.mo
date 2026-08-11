import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
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

  // ─── State ────────────────────────────────────────────────────────────────

  var stats : Map.Map<Principal, UserStats> = Map.empty<Principal, UserStats>();

  var friends : Map.Map<Principal, [Principal]> = Map.empty<Principal, [Principal]>();

  var examHistory : Map.Map<Principal, [EloSnapshot]> = Map.empty<Principal, [EloSnapshot]>();

  let MAX_HISTORY : Nat = 60;

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

  public query func metrics() : async { userCount : Nat } {
    { userCount = Map.size(stats) }
  };
}
