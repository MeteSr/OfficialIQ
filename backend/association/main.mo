import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Token "../lib/Token";
import Env "../lib/Env";
import Types "../lib/Types";
import Index "../lib/Index";
import Set "mo:core/Set";

persistent actor Association {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type AssociationRec = {
    id          : Text;
    name        : Text;
    sport       : Text;
    coordinator : Principal;
    joinCode    : Text;
    createdAt   : Int;
  };

  // `targetMembers` empty means "everyone currently in the association" —
  // resolved against the live member list at read time, so members who join
  // later are automatically in scope for existing all-member assignments.
  public type Assignment = {
    id            : Text;
    associationId : Text;
    title         : Text;
    articleIds    : [Text];
    casebook      : Bool;
    dueAt         : Int;
    targetMembers : [Principal];
    createdAt     : Int;
  };

  public type Completion = {
    assignmentId : Text;
    member       : Principal;
    score        : Nat;
    completedAt  : Int;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var associations   : Map.Map<Text, AssociationRec> = Map.empty<Text, AssociationRec>();
  var joinCodeIndex  : Map.Map<Text, Text>           = Map.empty<Text, Text>(); // joinCode -> associationId
  var members        : Map.Map<Text, [Principal]>    = Map.empty<Text, [Principal]>(); // associationId -> members
  var myAssociations : Map.Map<Principal, [Text]>    = Map.empty<Principal, [Text]>(); // member -> associationIds

  var assignments        : Map.Map<Text, Assignment> = Map.empty<Text, Assignment>();
  var assignmentsByAssoc : Map.Map<Text, [Text]>      = Map.empty<Text, [Text]>();

  var completions : Map.Map<Text, Completion> = Map.empty<Text, Completion>(); // key = assignmentId # "|" # member.toText()

  // Secondary indexes (lib/Index.mo), built from the tables above on the
  // upgrade that adds them. completionsByMember holds completion keys.
  var associationsByCoordinator : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((id, rec) in Map.entries(associations)) Index.add(ix, Principal.compare, rec.coordinator, id);
    ix
  };
  var completionsByMember : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((key, c) in Map.entries(completions)) Index.add(ix, Principal.compare, c.member, key);
    ix
  };

  var nextAssociationId : Nat = 0;
  var nextAssignmentId  : Nat = 0;

  func completionKey(assignmentId : Text, member : Principal) : Text {
    assignmentId # "|" # Principal.toText(member)
  };

  func isMember(associationId : Text, p : Principal) : Bool {
    switch (Map.get(members, Text.compare, associationId)) {
      case null false;
      case (?ms) { switch (Array.find<Principal>(ms, func(m) { m == p })) { case (?_) true; case null false } };
    }
  };

  func isTargeted(a : Assignment, p : Principal) : Bool {
    if (a.targetMembers.size() == 0) return isMember(a.associationId, p);
    switch (Array.find<Principal>(a.targetMembers, func(m) { m == p })) { case (?_) true; case null false }
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createAssociation(name : Text, sport : Text) : async Result.Result<AssociationRec, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    // Only officials an admin has made coordinators may set up an
    // association (user canister's setRole).
    let userId = switch (Env.canisterId<system>("user")) {
      case (?id) id;
      case null return #err("User canister not configured");
    };
    let userCanister = actor (Principal.toText(userId)) : actor { isCoordinator : shared query Principal -> async Bool };
    let allowed = try { await userCanister.isCoordinator(caller) } catch (_) { return #err("Couldn't check coordinator access, try again") };
    if (not allowed) return #err("Ask an OfficialIQ admin for coordinator access to create an association");
    // The join code is the only gate on membership (and members can read the
    // roster and assignments), so it must not be guessable. Retry on the
    // unlikely collision with an existing code.
    var joinCode = await Token.code(10);
    while (Map.get(joinCodeIndex, Text.compare, joinCode) != null) { joinCode := await Token.code(10) };
    let id       = "asc" # Nat.toText(nextAssociationId);
    nextAssociationId += 1;
    let rec : AssociationRec = { id; name; sport; coordinator = caller; joinCode; createdAt = Time.now() };
    Map.add(associations, Text.compare, id, rec);
    Map.add(joinCodeIndex, Text.compare, joinCode, id);
    Index.add(associationsByCoordinator, Principal.compare, caller, id);
    Map.add(members, Text.compare, id, [caller]);
    let mine = switch (Map.get(myAssociations, Principal.compare, caller)) { case (?a) a; case null [] };
    Map.add(myAssociations, Principal.compare, caller, Array.concat<Text>(mine, [id]));
    #ok(rec)
  };

  public shared ({ caller }) func joinAssociation(joinCode : Text) : async Result.Result<AssociationRec, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    switch (Map.get(joinCodeIndex, Text.compare, Token.normalizeCode(joinCode))) {
      case null #err("Invalid join code");
      case (?id) {
        switch (Map.get(associations, Text.compare, id)) {
          case null #err("Association not found");
          case (?rec) {
            let existing = switch (Map.get(members, Text.compare, id)) { case (?ms) ms; case null [] };
            if (Array.find<Principal>(existing, func(m) { m == caller }) == null) {
              Map.add(members, Text.compare, id, Array.concat<Principal>(existing, [caller]));
            };
            let mine = switch (Map.get(myAssociations, Principal.compare, caller)) { case (?a) a; case null [] };
            if (Array.find<Text>(mine, func(x) { x == id }) == null) {
              Map.add(myAssociations, Principal.compare, caller, Array.concat<Text>(mine, [id]));
            };
            #ok(rec)
          };
        }
      };
    }
  };

  public shared ({ caller }) func createAssignment(
    associationId : Text, title : Text, articleIds : [Text], casebook : Bool, dueAt : Int, targetMembers : [Principal],
  ) : async Result.Result<Assignment, Text> {
    switch (Map.get(associations, Text.compare, associationId)) {
      case null #err("Association not found");
      case (?rec) {
        if (rec.coordinator != caller) return #err("Only the coordinator can assign modules");
        let id = "asg" # Nat.toText(nextAssignmentId);
        nextAssignmentId += 1;
        let a : Assignment = { id; associationId; title; articleIds; casebook; dueAt; targetMembers; createdAt = Time.now() };
        Map.add(assignments, Text.compare, id, a);
        let existing = switch (Map.get(assignmentsByAssoc, Text.compare, associationId)) { case (?xs) xs; case null [] };
        Map.add(assignmentsByAssoc, Text.compare, associationId, Array.concat<Text>(existing, [id]));
        #ok(a)
      };
    }
  };

  // Client-reported scores are retired: completions come from a graded exam
  // session (recordGradedCompletion).
  public shared func recordCompletion(_assignmentId : Text, _score : Nat) : async Result.Result<(), Text> {
    #err("Assignments are graded by OfficialIQ now. Update the app.")
  };


  var usedSessions : Set.Set<Text> = Set.empty<Text>();

  /// Records an assignment completion from a finished exam session graded by
  /// the exam canister, taken on the assignment's articles. Each session
  /// counts once; retaking replaces the earlier completion.
  public shared ({ caller }) func recordGradedCompletion(assignmentId : Text, sessionId : Text) : async Result.Result<Completion, Text> {
    let examId = switch (Env.canisterId<system>("exam")) { case (?e) e; case null return #err("Exam canister not configured") };
    let exam = actor (Principal.toText(examId)) : Types.ExamResults;
    let r = switch (await exam.gradedResult(sessionId)) {
      case (?r) r;
      case null return #err("No finished graded exam with that id");
    };
    if (r.owner != caller) return #err("Not your exam");
    if (Set.contains(usedSessions, Text.compare, sessionId)) return #err("That exam was already used");
    switch (Map.get(assignments, Text.compare, assignmentId)) {
      case null #err("Assignment not found");
      case (?a) {
        if (not isTargeted(a, caller)) return #err("This module wasn't assigned to you");
        if (r.articleIds != a.articleIds) return #err("That exam doesn't cover this assignment's articles");
        let c : Completion = { assignmentId; member = caller; score = r.score; completedAt = Time.now() };
        let key = completionKey(assignmentId, caller);
        // A retake replaces the completion under the same key, so the key is
        // indexed only the first time.
        if (Map.get(completions, Text.compare, key) == null) Index.add(completionsByMember, Principal.compare, caller, key);
        Map.add(completions, Text.compare, key, c);
        Set.add(usedSessions, Text.compare, sessionId);
        #ok(c)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyAssociations() : async [AssociationRec] {
    let ids = switch (Map.get(myAssociations, Principal.compare, caller)) { case (?a) a; case null [] };
    let buf = List.empty<AssociationRec>();
    for (id in ids.values()) {
      switch (Map.get(associations, Text.compare, id)) { case (?rec) List.add(buf, rec); case null {} };
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyCoordinatedAssociations() : async [AssociationRec] {
    Index.rows(associationsByCoordinator, Principal.compare, caller, associations)
  };

  public shared query ({ caller }) func getAssociation(id : Text) : async ?AssociationRec {
    switch (Map.get(associations, Text.compare, id)) {
      case null null;
      case (?rec) { if (rec.coordinator == caller or isMember(id, caller)) ?rec else null };
    }
  };

  public shared query ({ caller }) func getAssociationMembers(id : Text) : async Result.Result<[Principal], Text> {
    switch (Map.get(associations, Text.compare, id)) {
      case null #err("Association not found");
      case (?rec) {
        if (rec.coordinator != caller and not isMember(id, caller)) return #err("Not authorized");
        #ok(switch (Map.get(members, Text.compare, id)) { case (?ms) ms; case null [] })
      };
    }
  };

  public shared query ({ caller }) func getAssociationAssignments(id : Text) : async Result.Result<[Assignment], Text> {
    switch (Map.get(associations, Text.compare, id)) {
      case null #err("Association not found");
      case (?rec) {
        if (rec.coordinator != caller and not isMember(id, caller)) return #err("Not authorized");
        let ids = switch (Map.get(assignmentsByAssoc, Text.compare, id)) { case (?xs) xs; case null [] };
        let buf = List.empty<Assignment>();
        for (aid in ids.values()) {
          switch (Map.get(assignments, Text.compare, aid)) { case (?a) List.add(buf, a); case null {} };
        };
        #ok(List.toArray(buf))
      };
    }
  };

  // Assignments currently targeting the caller, across every association
  // they belong to — surfaced on the official's Study page.
  public shared query ({ caller }) func getMyAssignments() : async [Assignment] {
    let ids = switch (Map.get(myAssociations, Principal.compare, caller)) { case (?a) a; case null [] };
    let buf = List.empty<Assignment>();
    for (id in ids.values()) {
      let assignmentIds = switch (Map.get(assignmentsByAssoc, Text.compare, id)) { case (?xs) xs; case null [] };
      for (aid in assignmentIds.values()) {
        switch (Map.get(assignments, Text.compare, aid)) {
          case (?a) { if (isTargeted(a, caller)) List.add(buf, a) };
          case null {};
        };
      };
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyCompletions() : async [Completion] {
    Index.rows(completionsByMember, Principal.compare, caller, completions)
  };

  // Coordinator-only: every completion recorded against one assignment,
  // used to render % complete and the score distribution.
  public shared query ({ caller }) func getAssignmentCompletions(assignmentId : Text) : async Result.Result<[Completion], Text> {
    switch (Map.get(assignments, Text.compare, assignmentId)) {
      case null #err("Assignment not found");
      case (?a) {
        switch (Map.get(associations, Text.compare, a.associationId)) {
          case null #err("Association not found");
          case (?rec) {
            if (rec.coordinator != caller) return #err("Coordinator only");
            // Completion keys are "<assignmentId>|<member>", so one
            // assignment's completions are a contiguous key range.
            let prefix = assignmentId # "|";
            let buf = List.empty<Completion>();
            label scan for ((key, c) in Map.entriesFrom(completions, Text.compare, prefix)) {
              if (not Text.startsWith(key, #text prefix)) break scan;
              List.add(buf, c);
            };
            #ok(List.toArray(buf))
          };
        }
      };
    }
  };

  // For other canisters (exam, ranking): is `coordinator` the coordinator of
  // an association that `member` belongs to? Lets coordinators see their own
  // members' history without making it public.
  public query func isCoordinatorOf(coordinator : Principal, member : Principal) : async Bool {
    let ids = switch (Map.get(myAssociations, Principal.compare, member)) { case (?a) a; case null [] };
    for (id in ids.values()) {
      switch (Map.get(associations, Text.compare, id)) {
        case (?rec) { if (rec.coordinator == coordinator) return true };
        case null {};
      };
    };
    false
  };

  // ─── Account deletion ──────────────────────────────────────────────────────

  /// Called by the user canister when an official deletes their account:
  /// removes them from every association and its assignments, drops their
  /// completions, and deletes the associations they coordinate (with their
  /// assignments and everyone's completions of them). Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    for (key in Index.take(completionsByMember, Principal.compare, p).values()) {
      Map.remove(completions, Text.compare, key);
    };
    let mine = switch (Map.take(myAssociations, Principal.compare, p)) { case (?a) a; case null [] };
    for (id in mine.values()) {
      let ms = switch (Map.get(members, Text.compare, id)) { case (?ms) ms; case null [] };
      Map.add(members, Text.compare, id, Array.filter<Principal>(ms, func(m) { m != p }));
    };
    // Named in an assignment's target list.
    for (aid in Map.keys(assignments)) {
      switch (Map.get(assignments, Text.compare, aid)) {
        case (?a) {
          if (Array.find<Principal>(a.targetMembers, func(m) { m == p }) != null) {
            Map.add(assignments, Text.compare, aid, { a with targetMembers = Array.filter<Principal>(a.targetMembers, func(m) { m != p }) });
          };
        };
        case null {};
      };
    };
    for (id in Index.take(associationsByCoordinator, Principal.compare, p).values()) {
      switch (Map.take(associations, Text.compare, id)) {
        case (?rec) Map.remove(joinCodeIndex, Text.compare, rec.joinCode);
        case null {};
      };
      let ms = switch (Map.take(members, Text.compare, id)) { case (?ms) ms; case null [] };
      for (m in ms.values()) {
        switch (Map.get(myAssociations, Principal.compare, m)) {
          case (?ids) Map.add(myAssociations, Principal.compare, m, Array.filter<Text>(ids, func(x) { x != id }));
          case null {};
        };
      };
      let aids = switch (Map.take(assignmentsByAssoc, Text.compare, id)) { case (?xs) xs; case null [] };
      for (aid in aids.values()) {
        Map.remove(assignments, Text.compare, aid);
        let prefix = aid # "|";
        let keys = List.empty<Text>();
        label scan for ((key, c) in Map.entriesFrom(completions, Text.compare, prefix)) {
          if (not Text.startsWith(key, #text prefix)) break scan;
          List.add(keys, key);
          Index.removeId(completionsByMember, Principal.compare, c.member, key);
        };
        for (key in List.values(keys)) Map.remove(completions, Text.compare, key);
      };
    };
    #ok(())
  };

  public query func metrics() : async { associationCount : Nat; assignmentCount : Nat } {
    { associationCount = Map.size(associations); assignmentCount = Map.size(assignments) }
  };
}
