import HashMap "mo:base/HashMap";  // mo:core/Map migration pending
import Text "mo:core/Text";
import Array "mo:core/Array";
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
    principal   : Principal;
    displayName : Text;
    sport       : Text;
    state       : Text;
    elo         : Float;
    streak      : Nat;
    accuracy    : Float;
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

  var friends : HashMap.HashMap<Principal, [Principal]> =
    HashMap.HashMap<Principal, [Principal]>(256, Principal.equal, Principal.hash);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  func sortByElo(pool : [UserStats]) : [UserStats] {
    Array.sort<UserStats>(pool, func(a, b) {
      if (a.elo > b.elo) #less
      else if (a.elo < b.elo) #greater
      else #equal
    })
  };

  func toEntries(sorted : [UserStats], limit : Nat) : [LeaderboardEntry] {
    let cap = if (limit < sorted.size()) limit else sorted.size();
    Array.tabulate<LeaderboardEntry>(cap, func(i) {
      let s = sorted[i];
      { rank = i + 1; principal = s.principal; displayName = s.displayName;
        elo = s.elo; accuracy = s.accuracy; streak = s.streak }
    })
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func recordExamResult(
    score        : Nat,
    questionCount: Nat,
    displayName  : Text,
    sport        : Text,
    state        : Text,
  ) : async () {
    let prev : UserStats = switch (stats.get(caller)) {
      case (?s) s;
      case null {
        { principal = caller; displayName; sport; state;
          elo = 1000.0; streak = 0; accuracy = 0.0; examCount = 0; updatedAt = 0 }
      };
    };
    let acc        = Float.fromInt(score) / 100.0;
    let newCount   = prev.examCount + 1;
    let newAcc     = (prev.accuracy * Float.fromInt(prev.examCount) + acc) / Float.fromInt(newCount);
    let delta      = (acc - 0.5) * 32.0;
    let newElo     = if (prev.elo + delta < 0.0) 0.0 else prev.elo + delta;
    let newStreak  = if (score >= 80) prev.streak + 1 else 0;
    stats.put(caller, {
      principal   = caller;
      displayName = displayName;
      sport;
      state;
      elo         = newElo;
      streak      = newStreak;
      accuracy    = newAcc;
      examCount   = newCount;
      updatedAt   = Time.now();
    });
  };

  public shared ({ caller }) func addFriend(friend : Principal) : async Result.Result<(), Text> {
    if (caller == friend) return #err("Cannot friend yourself");
    let existing = switch (friends.get(caller)) { case (?f) f; case null [] };
    let already = Array.find<Principal>(existing, func(p) { p == friend }) != null;
    if (already) return #err("Already friends");
    friends.put(caller, Array.append<Principal>(existing, [friend]));
    #ok(())
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getNational(sport : Text, limit : Nat) : async [LeaderboardEntry] {
    let buf = Array.init<UserStats>(stats.size(), {
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; accuracy = 0.0; examCount = 0; updatedAt = 0;
    });
    var i = 0;
    for ((_, s) in stats.entries()) {
      if (s.sport == sport) { buf[i] := s; i += 1 };
    };
    let pool = Array.tabulate<UserStats>(i, func(j) { buf[j] });
    toEntries(sortByElo(pool), limit)
  };

  public query func getState(sport : Text, state : Text, limit : Nat) : async [LeaderboardEntry] {
    let buf = Array.init<UserStats>(stats.size(), {
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; accuracy = 0.0; examCount = 0; updatedAt = 0;
    });
    var i = 0;
    for ((_, s) in stats.entries()) {
      if (s.sport == sport and s.state == state) { buf[i] := s; i += 1 };
    };
    let pool = Array.tabulate<UserStats>(i, func(j) { buf[j] });
    toEntries(sortByElo(pool), limit)
  };

  public shared query ({ caller }) func getFriends(sport : Text, limit : Nat) : async [LeaderboardEntry] {
    let myFriends = switch (friends.get(caller)) { case (?f) f; case null [] };
    let all = Array.append<Principal>(myFriends, [caller]);
    let buf = Array.init<UserStats>(all.size(), {
      principal = Principal.fromText("2vxsx-fae"); displayName = ""; sport = "";
      state = ""; elo = 0.0; streak = 0; accuracy = 0.0; examCount = 0; updatedAt = 0;
    });
    var i = 0;
    for (p in all.vals()) {
      switch (stats.get(p)) {
        case (?s) { if (s.sport == sport) { buf[i] := s; i += 1 } };
        case null {};
      };
    };
    let pool = Array.tabulate<UserStats>(i, func(j) { buf[j] });
    toEntries(sortByElo(pool), limit)
  };

  public shared query ({ caller }) func getMyStats() : async ?UserStats {
    stats.get(caller)
  };

  public query func metrics() : async { userCount : Nat } {
    { userCount = stats.size() }
  };
}
