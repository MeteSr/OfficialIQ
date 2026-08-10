import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

persistent actor Challenge {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ChallengeStatus = { #Pending; #Accepted; #Completed; #Declined; #Expired };

  public type ChallengeResult = {
    principal : Principal;
    score     : Nat;   // 0-100
    finishedAt: Int;
  };

  public type Challenge = {
    id          : Text;
    challenger  : Principal;
    challenged  : Principal;
    sport       : Text;
    articleIds  : [Text];
    questionIds : [Text];
    count       : Nat;
    status      : ChallengeStatus;
    results     : [ChallengeResult];
    createdAt   : Int;
    expiresAt   : Int;   // 72h window
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var challenges : HashMap.HashMap<Text, Challenge> =
    HashMap.HashMap<Text, Challenge>(256, Text.equal, Text.hash);

  var nextId : Nat = 0;

  let TTL_NS : Int = 72 * 3600 * 1_000_000_000; // 72 hours in nanoseconds

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func sendChallenge(
    opponent    : Principal,
    sport       : Text,
    articleIds  : [Text],
    questionIds : [Text],
    count       : Nat,
  ) : async Result.Result<Challenge, Text> {
    if (caller == opponent) return #err("Cannot challenge yourself");
    let id = "ch" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let ch : Challenge = {
      id          = id;
      challenger  = caller;
      challenged  = opponent;
      sport       = sport;
      articleIds  = articleIds;
      questionIds = questionIds;
      count       = count;
      status      = #Pending;
      results     = [];
      createdAt   = now;
      expiresAt   = now + TTL_NS;
    };
    challenges.put(id, ch);
    #ok(ch)
  };

  public shared ({ caller }) func acceptChallenge(id : Text) : async Result.Result<Challenge, Text> {
    switch (challenges.get(id)) {
      case null { #err("Challenge not found") };
      case (?ch) {
        if (ch.challenged != caller) return #err("Not your challenge");
        if (Time.now() > ch.expiresAt) {
          challenges.put(id, { ch with status = #Expired });
          return #err("Challenge expired");
        };
        let updated = { ch with status = #Accepted };
        challenges.put(id, updated);
        #ok(updated)
      };
    }
  };

  public shared ({ caller }) func submitResult(id : Text, score : Nat) : async Result.Result<Challenge, Text> {
    switch (challenges.get(id)) {
      case null { #err("Challenge not found") };
      case (?ch) {
        if (ch.challenger != caller and ch.challenged != caller) return #err("Not a participant");
        let res : ChallengeResult = { principal = caller; score = score; finishedAt = Time.now() };
        let newResults = Array.append(ch.results, [res]);
        let done = newResults.size() == 2;
        let updated = { ch with results = newResults; status = if (done) #Completed else ch.status };
        challenges.put(id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyChallenges() : async [Challenge] {
    var out : [Challenge] = [];
    for ((_, ch) in challenges.entries()) {
      if (ch.challenger == caller or ch.challenged == caller) {
        out := Array.append(out, [ch]);
      };
    };
    out
  };

  public query func getChallenge(id : Text) : async ?Challenge {
    challenges.get(id)
  };

  public query func metrics() : async { challengeCount : Nat } {
    { challengeCount = challenges.size() }
  };
}
