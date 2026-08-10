import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Float "mo:base/Float";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

persistent actor Ranking {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type LeaderboardScope = { #Friends; #State; #National };

  public type UserStats = {
    principal   : Principal;
    displayName : Text;
    sport       : Text;
    state       : Text;
    elo         : Float;
    streak      : Nat;
    accuracy    : Float;   // 0.0–1.0
    examCount   : Nat;
    updatedAt   : Int;
  };

  public type LeaderboardEntry = {
    rank        : Nat;
    principal   : Principal;
    displayName : Text;
    elo         : Float;
    accuracy    : Float;
    streak      : Nat;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var stats : HashMap.HashMap<Principal, UserStats> =
    HashMap.HashMap<Principal, UserStats>(256, Principal.equal, Principal.hash);

  // friendship map: principal → [friend principals]
  var friends : HashMap.HashMap<Principal, [Principal]> =
    HashMap.HashMap<Principal, [Principal]>(256, Principal.equal, Principal.hash);

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func recordExamResult(
    score : Nat,          // 0-100
    questionCount : Nat,
    displayName : Text,
    sport : Text,
    state : Text,
  ) : async () {
    let existing = stats.get(caller);
    let prev = switch existing {
      case (?s) s;
      case null {
        {
          principal   = caller;
          displayName = displayName;
          sport       = sport;
          state       = state;
          elo         = 1000.0;
          streak      = 0;
          accuracy    = 0.0;
          examCount   = 0;
          updatedAt   = 0;
        }
      };
    };

    let acc = Float.fromInt(score) / 100.0;
    let newExamCount = prev.examCount + 1;
    let newAccuracy = (prev.accuracy * Float.fromInt(prev.examCount) + acc) / Float.fromInt(newExamCount);
    let delta : Float = (acc - 0.5) * 32.0; // simplified ELO delta
    let newElo = if (prev.elo + delta < 0.0) 0.0 else prev.elo + delta;
    let newStreak = if (score >= 80) prev.streak + 1 else 0;

    let updated : UserStats = {
      principal   = caller;
      displayName = displayName;
      sport       = sport;
      state       = state;
      elo         = newElo;
      streak      = newStreak;
      accuracy    = newAccuracy;
      examCount   = newExamCount;
      updatedAt   = Time.now();
    };
    stats.put(caller, updated);
  };

  public shared ({ caller }) func addFriend(friend : Principal) : async Result.Result<(), Text> {
    if (caller == friend) return #err("Cannot friend yourself");
    let existing = switch (friends.get(caller)) { case (?f) f; case null [] };
    let alreadyFriend = Array.find<Principal>(existing, func(p) { p == friend }) != null;
    if (alreadyFriend) return #err("Already friends");
    friends.put(caller, Array.append(existing, [friend]));
    #ok(())
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getNational(sport : Text, limit : Nat) : async [LeaderboardEntry] {
    var pool : [UserStats] = [];
    for ((_, s) in stats.entries()) {
      if (s.sport == sport) pool := Array.append(pool, [s]);
    };
    let sorted = Array.sort<UserStats>(pool, func(a, b) {
      if (a.elo > b.elo) #less
      else if (a.elo < b.elo) #greater
      else #equal
    });
    let cap = if (limit < sorted.size()) limit else sorted.size();
    Array.tabulate<LeaderboardEntry>(cap, func(i) {
      let s = sorted[i];
      { rank = i + 1; principal = s.principal; displayName = s.displayName;
        elo = s.elo; accuracy = s.accuracy; streak = s.streak }
    })
  };

  public query func getState(sport : Text, state : Text, limit : Nat) : async [LeaderboardEntry] {
    var pool : [UserStats] = [];
    for ((_, s) in stats.entries()) {
      if (s.sport == sport and s.state == state) pool := Array.append(pool, [s]);
    };
    let sorted = Array.sort<UserStats>(pool, func(a, b) {
      if (a.elo > b.elo) #less else if (a.elo < b.elo) #greater else #equal
    });
    let cap = if (limit < sorted.size()) limit else sorted.size();
    Array.tabulate<LeaderboardEntry>(cap, func(i) {
      let s = sorted[i];
      { rank = i + 1; principal = s.principal; displayName = s.displayName;
        elo = s.elo; accuracy = s.accuracy; streak = s.streak }
    })
  };

  public shared query ({ caller }) func getFriends(sport : Text, limit : Nat) : async [LeaderboardEntry] {
    let myFriends = switch (friends.get(caller)) { case (?f) f; case null [] };
    let all = Array.append(myFriends, [caller]);
    var pool : [UserStats] = [];
    for (p in all.vals()) {
      switch (stats.get(p)) {
        case (?s) { if (s.sport == sport) pool := Array.append(pool, [s]) };
        case null {};
      };
    };
    let sorted = Array.sort<UserStats>(pool, func(a, b) {
      if (a.elo > b.elo) #less else if (a.elo < b.elo) #greater else #equal
    });
    let cap = if (limit < sorted.size()) limit else sorted.size();
    Array.tabulate<LeaderboardEntry>(cap, func(i) {
      let s = sorted[i];
      { rank = i + 1; principal = s.principal; displayName = s.displayName;
        elo = s.elo; accuracy = s.accuracy; streak = s.streak }
    })
  };

  public shared query ({ caller }) func getMyStats() : async ?UserStats {
    stats.get(caller)
  };

  public query func metrics() : async { userCount : Nat } {
    { userCount = stats.size() }
  };
}
