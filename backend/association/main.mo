import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

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
    let id       = "asc" # Nat.toText(nextAssociationId);
    let joinCode = "JOIN" # Nat.toText(nextAssociationId);
    nextAssociationId += 1;
    let rec : AssociationRec = { id; name; sport; coordinator = caller; joinCode; createdAt = Time.now() };
    Map.add(associations, Text.compare, id, rec);
    Map.add(joinCodeIndex, Text.compare, joinCode, id);
    Map.add(members, Text.compare, id, [caller]);
    Map.add(myAssociations, Principal.compare, caller, [id]);
    #ok(rec)
  };

  public shared ({ caller }) func joinAssociation(joinCode : Text) : async Result.Result<AssociationRec, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    switch (Map.get(joinCodeIndex, Text.compare, joinCode)) {
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

  public shared ({ caller }) func recordCompletion(assignmentId : Text, score : Nat) : async Result.Result<(), Text> {
    switch (Map.get(assignments, Text.compare, assignmentId)) {
      case null #err("Assignment not found");
      case (?a) {
        if (not isTargeted(a, caller)) return #err("This module wasn't assigned to you");
        let c : Completion = { assignmentId; member = caller; score; completedAt = Time.now() };
        Map.add(completions, Text.compare, completionKey(assignmentId, caller), c);
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyAssociations() : async [AssociationRec] {
    let ids = switch (Map.get(myAssociations, Principal.compare, caller)) { case (?a) a; case null [] };
    let buf = List.empty<AssociationRec>();
    for (id in ids.vals()) {
      switch (Map.get(associations, Text.compare, id)) { case (?rec) List.add(buf, rec); case null {} };
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyCoordinatedAssociations() : async [AssociationRec] {
    let buf = List.empty<AssociationRec>();
    for ((_, rec) in Map.entries(associations)) {
      if (rec.coordinator == caller) List.add(buf, rec);
    };
    List.toArray(buf)
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
        for (aid in ids.vals()) {
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
    for (id in ids.vals()) {
      let assignmentIds = switch (Map.get(assignmentsByAssoc, Text.compare, id)) { case (?xs) xs; case null [] };
      for (aid in assignmentIds.vals()) {
        switch (Map.get(assignments, Text.compare, aid)) {
          case (?a) { if (isTargeted(a, caller)) List.add(buf, a) };
          case null {};
        };
      };
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyCompletions() : async [Completion] {
    let buf = List.empty<Completion>();
    for ((_, c) in Map.entries(completions)) {
      if (c.member == caller) List.add(buf, c);
    };
    List.toArray(buf)
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
            let buf = List.empty<Completion>();
            for ((_, c) in Map.entries(completions)) {
              if (c.assignmentId == assignmentId) List.add(buf, c);
            };
            #ok(List.toArray(buf))
          };
        }
      };
    }
  };

  public query func metrics() : async { associationCount : Nat; assignmentCount : Nat } {
    { associationCount = Map.size(associations); assignmentCount = Map.size(assignments) }
  };
}
