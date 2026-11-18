import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Env "../lib/Env";
import Index "../lib/Index";
import Set "mo:core/Set";

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

  var challenges : Map.Map<Text, Challenge> = Map.empty<Text, Challenge>();

  // participant (challenger or challenged) -> challenge ids (lib/Index.mo),
  // built from `challenges` on the upgrade that adds it.
  var challengesByParticipant : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((id, ch) in Map.entries(challenges)) {
      Index.add(ix, Principal.compare, ch.challenger, id);
      Index.add(ix, Principal.compare, ch.challenged, id);
    };
    ix
  };

  var nextId : Nat = 0;

  let TTL_NS : Int = 72 * 3600 * 1_000_000_000;
  let MAX_QUESTIONS : Nat = 200;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func sendChallenge(
    opponent    : Principal,
    sport       : Text,
    articleIds  : [Text],
    questionIds : [Text],
    count       : Nat,
  ) : async Result.Result<Challenge, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (caller == opponent) return #err("Cannot challenge yourself");
    if (questionIds.size() > MAX_QUESTIONS or articleIds.size() > MAX_QUESTIONS) return #err("Too many questions");
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
    Map.add(challenges, Text.compare, id, ch);
    Index.add(challengesByParticipant, Principal.compare, caller, id);
    Index.add(challengesByParticipant, Principal.compare, opponent, id);
    #ok(ch)
  };

  public shared ({ caller }) func acceptChallenge(id : Text) : async Result.Result<Challenge, Text> {
    switch (Map.get(challenges, Text.compare, id)) {
      case null { #err("Challenge not found") };
      case (?ch) {
        if (ch.challenged != caller) return #err("Not your challenge");
        if (Time.now() > ch.expiresAt) {
          Map.add(challenges, Text.compare, id, {
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
        Map.add(challenges, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // Client-reported scores are retired: use submitGradedResult with the
  // exam session the challenge was played in.
  public shared func submitResult(_id : Text, _score : Nat) : async Result.Result<Challenge, Text> {
    #err("Challenges are graded by OfficialIQ now. Update the app.")
  };

  type GradedResult = {
    id : Text; owner : Principal; mode : { #Solo; #ShareLink; #Timed; #Certification };
    sportId : Text; articleIds : [Text]; questionIds : [Text];
    questionCount : Nat; answered : Nat; correct : Nat; score : Nat; avgElapsedSec : Nat; finishedAt : Int;
  };

  var usedSessions : Set.Set<Text> = Set.empty<Text>();

  /// Records the caller's result from a finished exam session graded by the
  /// exam canister. The session must cover exactly this challenge's
  /// questions and can be used once.
  public shared ({ caller }) func submitGradedResult(id : Text, sessionId : Text) : async Result.Result<Challenge, Text> {
    let examId = switch (Env.canisterId<system>("exam")) { case (?e) e; case null return #err("Exam canister not configured") };
    let exam = actor (Principal.toText(examId)) : actor { gradedResult : shared query Text -> async ?GradedResult };
    let r = switch (await exam.gradedResult(sessionId)) {
      case (?r) r;
      case null return #err("No finished graded exam with that id");
    };
    if (r.owner != caller) return #err("Not your exam");
    if (Set.contains(usedSessions, Text.compare, sessionId)) return #err("That exam was already used");
    switch (Map.get(challenges, Text.compare, id)) {
      case null #err("Challenge not found");
      case (?ch) {
        if (r.questionIds != ch.questionIds) return #err("That exam doesn't match this challenge's questions");
        switch (recordResult(caller, ch, r.score)) {
          case (#ok(c)) { Set.add(usedSessions, Text.compare, sessionId); #ok(c) };
          case (#err(e)) #err(e);
        }
      };
    }
  };

  func recordResult(caller : Principal, ch : Challenge, score : Nat) : Result.Result<Challenge, Text> {
    let id = ch.id;
    if (ch.challenger != caller and ch.challenged != caller) return #err("Not a participant");
    // One result per participant, only on a live challenge: otherwise
    // either side could overwrite the outcome or complete the challenge
    // on their own by submitting twice.
    switch (ch.status) {
      case (#Pending or #Accepted) {};
      case _ return #err("Challenge is closed");
    };
    if (Time.now() > ch.expiresAt) return #err("Challenge expired");
    if (Array.find<ChallengeResult>(ch.results, func(r) { r.principal == caller }) != null) return #err("Result already submitted");
    if (score > 100) return #err("Score must be 0-100");
    let res : ChallengeResult = { principal = caller; score; finishedAt = Time.now() };
    let newResults = Array.concat<ChallengeResult>(ch.results, [res]);
    let done = newResults.size() == 2;
    let updated : Challenge = {
      id = ch.id; challenger = ch.challenger; challenged = ch.challenged;
      sport = ch.sport; articleIds = ch.articleIds; questionIds = ch.questionIds;
      count = ch.count;
      status = if (done) #Completed else ch.status;
      results = newResults;
      createdAt = ch.createdAt; expiresAt = ch.expiresAt;
    };
    Map.add(challenges, Text.compare, id, updated);
    #ok(updated)
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyChallenges() : async [Challenge] {
    Index.rows(challengesByParticipant, Principal.compare, caller, challenges)
  };

  public query func getChallenge(id : Text) : async ?Challenge {
    Map.get(challenges, Text.compare, id)
  };

  public query func metrics() : async { challengeCount : Nat } {
    { challengeCount = Map.size(challenges) }
  };
}
