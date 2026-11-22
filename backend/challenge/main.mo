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
import Types "../lib/Types";
import Index "../lib/Index";
import Set "mo:core/Set";
import Token "../lib/Token";
import ChallengeExpiry "../lib/ChallengeExpiry";

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

  let TTL_NS : Int = ChallengeExpiry.TTL_NS;
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
          Map.add(challenges, Text.compare, id, { ch with status = #Expired });
          return #err("Challenge expired");
        };
        let updated : Challenge = { ch with status = #Accepted };
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


  var usedSessions : Set.Set<Text> = Set.empty<Text>();

  /// Records the caller's result from a finished exam session graded by the
  /// exam canister. The session must cover exactly this challenge's
  /// questions and can be used once.
  public shared ({ caller }) func submitGradedResult(id : Text, sessionId : Text) : async Result.Result<Challenge, Text> {
    let examId = switch (Env.canisterId<system>("exam")) { case (?e) e; case null return #err("Exam canister not configured") };
    let exam = actor (Principal.toText(examId)) : Types.ExamResults;
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
    let updated : Challenge = { ch with status = if (done) #Completed else ch.status; results = newResults };
    Map.add(challenges, Text.compare, id, updated);
    #ok(updated)
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  // An open challenge past its 72 hours reads as #Expired, so it leaves the
  // inbox on time even if nobody has called since (lib/ChallengeExpiry.mo).
  func current(ch : Challenge) : Challenge {
    { ch with status = ChallengeExpiry.status(ch.status, ch.expiresAt, Time.now()) }
  };

  public shared query ({ caller }) func getMyChallenges() : async [Challenge] {
    Array.map<Challenge, Challenge>(Index.rows(challengesByParticipant, Principal.compare, caller, challenges), current)
  };

  public query func getChallenge(id : Text) : async ?Challenge {
    switch (Map.get(challenges, Text.compare, id)) { case (?ch) ?current(ch); case null null }
  };

  // ─── Crew pregame (#64) ─────────────────────────────────────────────────
  // Officials working the same game join a crew by its code, all play the
  // same fixed question set (graded by the exam canister like a challenge,
  // one session per player), and then see each other's misses. The question
  // set comes from an exam share link, so the canister picked it and nobody
  // saw the answers first.

  public type CrewResult = {
    principal  : Principal;
    score      : Nat;
    missed     : [Text];
    finishedAt : Int;
  };

  public type Crew = {
    id          : Text;
    code        : Text;
    creator     : Principal;
    gameLabel   : Text;
    gameDate    : Int;
    sportId     : Text;
    levelId     : Text;
    questionIds : [Text];
    members     : [Principal];
    results     : [CrewResult];
    createdAt   : Int;
    expiresAt   : Int;
  };

  /// What someone holding the code sees before joining.
  public type CrewPreview = {
    id          : Text;
    gameLabel   : Text;
    gameDate    : Int;
    sportId     : Text;
    levelId     : Text;
    memberCount : Nat;
    questionCount : Nat;
    expiresAt   : Int;
  };

  public type CrewInput = {
    gameLabel   : Text;
    gameDate    : Int;
    sportId     : Text;
    levelId     : Text;
    questionIds : [Text];
  };

  var crews        : Map.Map<Text, Crew> = Map.empty<Text, Crew>();
  var crewCodes    : Map.Map<Text, Text> = Map.empty<Text, Text>();
  var crewsByMember : Index.Index<Principal> = Index.empty<Principal>();
  var nextCrewId   : Nat = 0;

  transient let MAX_CREW : Nat = 8;
  transient let MAX_CREW_QUESTIONS : Nat = 15;
  // A crew stays open until a while after its game, then closes.
  transient let CREW_AFTER_GAME_NS : Int = 6 * 3600 * 1_000_000_000;
  transient let MAX_CREW_AHEAD_NS : Int = 30 * 24 * 3600 * 1_000_000_000;

  func previewOf(c : Crew) : CrewPreview {
    { id = c.id; gameLabel = c.gameLabel; gameDate = c.gameDate; sportId = c.sportId; levelId = c.levelId;
      memberCount = c.members.size(); questionCount = c.questionIds.size(); expiresAt = c.expiresAt }
  };

  func isMember(c : Crew, p : Principal) : Bool {
    Array.find<Principal>(c.members, func(m) { m == p }) != null
  };

  public shared ({ caller }) func createCrew(input : CrewInput) : async Result.Result<Crew, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let label_ = Text.trim(input.gameLabel, #char ' ');
    if (label_.size() == 0 or label_.size() > 80) return #err("Game name must be 1-80 characters");
    if (input.questionIds.size() == 0 or input.questionIds.size() > MAX_CREW_QUESTIONS) return #err("1-" # Nat.toText(MAX_CREW_QUESTIONS) # " questions");
    let now = Time.now();
    if (input.gameDate + CREW_AFTER_GAME_NS < now) return #err("That game is already over");
    if (input.gameDate > now + MAX_CREW_AHEAD_NS) return #err("Crews open up to 30 days before a game");
    // Join codes are bearer links, so they come from raw_rand.
    let code = await Token.code(10);
    if (Map.get(crewCodes, Text.compare, code) != null) return #err("Try again");
    let id = "crew" # Nat.toText(nextCrewId);
    nextCrewId += 1;
    let crew : Crew = {
      id; code; creator = caller; gameLabel = label_; gameDate = input.gameDate;
      sportId = input.sportId; levelId = input.levelId; questionIds = input.questionIds;
      members = [caller]; results = []; createdAt = now;
      expiresAt = input.gameDate + CREW_AFTER_GAME_NS;
    };
    Map.add(crews, Text.compare, id, crew);
    Map.add(crewCodes, Text.compare, code, id);
    Index.add(crewsByMember, Principal.compare, caller, id);
    #ok(crew)
  };

  public query func getCrewPreview(code : Text) : async ?CrewPreview {
    switch (Map.get(crewCodes, Text.compare, Token.normalizeCode(code))) {
      case null null;
      case (?id) switch (Map.get(crews, Text.compare, id)) { case (?c) ?previewOf(c); case null null };
    }
  };

  public shared ({ caller }) func joinCrew(code : Text) : async Result.Result<Crew, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id = switch (Map.get(crewCodes, Text.compare, Token.normalizeCode(code))) {
      case (?id) id;
      case null return #err("Crew not found");
    };
    let c = switch (Map.get(crews, Text.compare, id)) { case (?c) c; case null return #err("Crew not found") };
    if (isMember(c, caller)) return #ok(c);
    if (Time.now() > c.expiresAt) return #err("This crew has closed");
    if (c.members.size() >= MAX_CREW) return #err("This crew is full");
    let updated = { c with members = Array.concat<Principal>(c.members, [caller]) };
    Map.add(crews, Text.compare, id, updated);
    // A member who left and comes back is already indexed.
    if (Array.find<Text>(Index.ids(crewsByMember, Principal.compare, caller), func(x) { x == id }) == null) {
      Index.add(crewsByMember, Principal.compare, caller, id);
    };
    #ok(updated)
  };

  /// Members only: the crew with everyone's results and misses.
  public shared query ({ caller }) func getCrew(id : Text) : async ?Crew {
    switch (Map.get(crews, Text.compare, id)) {
      case (?c) { if (isMember(c, caller)) ?c else null };
      case null null;
    }
  };

  public shared query ({ caller }) func getMyCrews() : async [Crew] {
    Array.filter<Crew>(Index.rows(crewsByMember, Principal.compare, caller, crews), func(c) { isMember(c, caller) })
  };

  /// Records the caller's score and misses from the graded exam session they
  /// played this crew's questions in.
  public shared ({ caller }) func submitCrewResult(id : Text, sessionId : Text) : async Result.Result<Crew, Text> {
    let examId = switch (Env.canisterId<system>("exam")) { case (?e) e; case null return #err("Exam canister not configured") };
    let c0 = switch (Map.get(crews, Text.compare, id)) { case (?c) c; case null return #err("Crew not found") };
    if (not isMember(c0, caller)) return #err("Not in this crew");
    let exam = actor (Principal.toText(examId)) : Types.ExamMisses;
    let r = switch (await exam.gradedResult(sessionId)) {
      case (?r) r;
      case null return #err("No finished graded exam with that id");
    };
    let missed = switch (await exam.gradedMisses(sessionId)) {
      case (?m) m;
      case null return #err("No finished graded exam with that id");
    };
    if (r.owner != caller) return #err("Not your exam");
    // Re-read after the awaits.
    let c = switch (Map.get(crews, Text.compare, id)) { case (?c) c; case null return #err("Crew not found") };
    if (r.questionIds != c.questionIds) return #err("That exam doesn't match this crew's questions");
    if (Set.contains(usedSessions, Text.compare, sessionId)) return #err("That exam was already used");
    if (Array.find<CrewResult>(c.results, func(x) { x.principal == caller }) != null) return #err("Result already submitted");
    if (Time.now() > c.expiresAt) return #err("This crew has closed");
    let res : CrewResult = { principal = caller; score = r.score; missed; finishedAt = Time.now() };
    let updated = { c with results = Array.concat<CrewResult>(c.results, [res]) };
    Map.add(crews, Text.compare, id, updated);
    Set.add(usedSessions, Text.compare, sessionId);
    #ok(updated)
  };

  public shared ({ caller }) func leaveCrew(id : Text) : async Result.Result<(), Text> {
    let c = switch (Map.get(crews, Text.compare, id)) { case (?c) c; case null return #err("Crew not found") };
    if (not isMember(c, caller)) return #err("Not in this crew");
    // A result already played stays (the session can't be replayed), but
    // only members' results are shown.
    Map.add(crews, Text.compare, id, { c with members = Array.filter<Principal>(c.members, func(m) { m != caller }) });
    // crewsByMember keeps the id; getMyCrews filters by membership.
    #ok(())
  };

  // ─── Account deletion ──────────────────────────────────────────────────────

  /// Called by the user canister when an official deletes their account:
  /// deletes every challenge they sent or received, and takes them (and
  /// their results) out of every crew; a crew left with no members is
  /// deleted. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    for (id in Index.take(challengesByParticipant, Principal.compare, p).values()) {
      switch (Map.take(challenges, Text.compare, id)) {
        case (?ch) {
          let other = if (ch.challenger == p) ch.challenged else ch.challenger;
          Index.removeId(challengesByParticipant, Principal.compare, other, id);
        };
        case null {};
      };
    };
    for (id in Index.take(crewsByMember, Principal.compare, p).values()) {
      switch (Map.get(crews, Text.compare, id)) {
        case (?c) {
          let members = Array.filter<Principal>(c.members, func(m) { m != p });
          if (members.size() == 0) {
            Map.remove(crews, Text.compare, id);
            Map.remove(crewCodes, Text.compare, c.code);
          } else {
            Map.add(crews, Text.compare, id, { c with
              members;
              results = Array.filter<CrewResult>(c.results, func(r) { r.principal != p });
              creator = if (c.creator == p) Principal.anonymous() else c.creator;
            });
          };
        };
        case null {};
      };
    };
    #ok(())
  };

  public query func metrics() : async { challengeCount : Nat; crewCount : Nat } {
    { challengeCount = Map.size(challenges); crewCount = Map.size(crews) }
  };
}
