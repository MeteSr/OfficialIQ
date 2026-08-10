import HashMap "mo:base/HashMap";  // mo:core/Map migration pending
import Text "mo:core/Text";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

persistent actor Challenge {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ChallengeStatus = { #Pending; #Accepted; #Completed; #Declined; #Expired };

  public type ChallengeResult = {
    principal  : Principal;
    score      : Nat;
    finishedAt : Int;
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
    expiresAt   : Int;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var challenges : HashMap.HashMap<Text, Challenge> =
    HashMap.HashMap<Text, Challenge>(256, Text.equal, Text.hash);

  var nextId : Nat = 0;

  let TTL_NS : Int = 72 * 3600 * 1_000_000_000;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func sendChallenge(
    opponent    : Principal,
    sport       : Text,
    articleIds  : [Text],
    questionIds : [Text],
    count       : Nat,
  ) : async Result.Result<Challenge, Text> {
    if (caller == opponent) return #err("Cannot challenge yourself");
    let id  = "ch" # Nat.toText(nextId);
    nextId += 1;
    let now = Time.now();
    let ch : Challenge = {
      id          = id;
      challenger  = caller;
      challenged  = opponent;
      sport;
      articleIds;
      questionIds;
      count;
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
          challenges.put(id, {
            id = ch.id; challenger = ch.challenger; challenged = ch.challenged;
            sport = ch.sport; articleIds = ch.articleIds; questionIds = ch.questionIds;
            count = ch.count; status = #Expired; results = ch.results;
            createdAt = ch.createdAt; expiresAt = ch.expiresAt;
          });
          return #err("Challenge expired");
        };
        let updated : Challenge = {
          id = ch.id; challenger = ch.challenger; challenged = ch.challenged;
          sport = ch.sport; articleIds = ch.articleIds; questionIds = ch.questionIds;
          count = ch.count; status = #Accepted; results = ch.results;
          createdAt = ch.createdAt; expiresAt = ch.expiresAt;
        };
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
        let res : ChallengeResult = { principal = caller; score; finishedAt = Time.now() };
        let newResults = Array.append<ChallengeResult>(ch.results, [res]);
        let done = newResults.size() == 2;
        let updated : Challenge = {
          id = ch.id; challenger = ch.challenger; challenged = ch.challenged;
          sport = ch.sport; articleIds = ch.articleIds; questionIds = ch.questionIds;
          count = ch.count;
          status = if (done) #Completed else ch.status;
          results = newResults;
          createdAt = ch.createdAt; expiresAt = ch.expiresAt;
        };
        challenges.put(id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyChallenges() : async [Challenge] {
    let buf = Array.init<Challenge>(challenges.size(), {
      id = ""; challenger = caller; challenged = caller; sport = "";
      articleIds = []; questionIds = []; count = 0; status = #Pending;
      results = []; createdAt = 0; expiresAt = 0;
    });
    var i = 0;
    for ((_, ch) in challenges.entries()) {
      if (ch.challenger == caller or ch.challenged == caller) {
        buf[i] := ch;
        i += 1;
      };
    };
    Array.tabulate<Challenge>(i, func(j) { buf[j] })
  };

  public query func getChallenge(id : Text) : async ?Challenge {
    challenges.get(id)
  };

  public query func metrics() : async { challengeCount : Nat } {
    { challengeCount = challenges.size() }
  };
}
