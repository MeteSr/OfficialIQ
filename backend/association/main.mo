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
import Training "../lib/Training";
import Set "mo:core/Set";
import Char "mo:core/Char";
import Nat32 "mo:core/Nat32";
import Nat8 "mo:core/Nat8";
import Iter "mo:core/Iter";
import Error "mo:core/Error";
import Timer "mo:core/Timer";
import Call "mo:ic/Call";
import IC "mo:ic/Types";
import Billing "../lib/Billing";
import Json "../lib/Json";
import License "../lib/License";

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
    if (paywallOn) {
      startTrial(id);
      armSeatSync<system>(0);
    };
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
            if (refreshSeats(id)) await* pushSeats<system>(id);
            #ok(rec)
          };
        }
      };
    }
  };

  public type AssignmentError = { #associationNotFound; #notCoordinator; #licenseRequired };

  public shared ({ caller }) func createAssignment(
    associationId : Text, title : Text, articleIds : [Text], casebook : Bool, dueAt : Int, targetMembers : [Principal],
  ) : async Result.Result<Assignment, AssignmentError> {
    switch (Map.get(associations, Text.compare, associationId)) {
      case null #err(#associationNotFound);
      case (?rec) {
        if (rec.coordinator != caller) return #err(#notCoordinator);
        if (not licensed(associationId)) return #err(#licenseRequired);
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

  // ─── Training requirement (issue #67) ──────────────────────────────────────
  //
  // How many training hours a member must log per season. A season is the
  // twelve months from the 1st of seasonStartMonth, so it stays within the
  // exam canister's 12-month retention. Rules in lib/Training.mo.

  public type TrainingRequirement = {
    hoursPerSeason   : Nat;
    seasonStartMonth : Nat;
    updatedAt        : Int;
  };

  public type SetRequirementError = {
    #associationNotFound;
    #notCoordinator;
    #invalidHours;
    #invalidSeasonStartMonth;
    #licenseRequired;
  };

  public type GetRequirementError = { #associationNotFound; #notAuthorized };

  let trainingRequirements : Map.Map<Text, TrainingRequirement> = Map.empty<Text, TrainingRequirement>();

  /// Sets the association's requirement, or clears it with null.
  /// Coordinator only.
  public shared ({ caller }) func setTrainingRequirement(
    associationId : Text, input : ?Training.RequirementInput,
  ) : async Result.Result<?TrainingRequirement, SetRequirementError> {
    let rec = switch (associations.get(Text.compare, associationId)) {
      case (?r) r;
      case null return #err(#associationNotFound);
    };
    if (rec.coordinator != caller) return #err(#notCoordinator);
    switch input {
      case null {
        trainingRequirements.remove(Text.compare, associationId);
        #ok(null)
      };
      case (?i) {
        // Clearing a requirement stays free; setting one needs the license.
        if (not licensed(associationId)) return #err(#licenseRequired);
        switch (Training.validateRequirement(i)) {
          case (?#invalidHours) return #err(#invalidHours);
          case (?#invalidSeasonStartMonth) return #err(#invalidSeasonStartMonth);
          case null {};
        };
        let r : TrainingRequirement = { hoursPerSeason = i.hoursPerSeason; seasonStartMonth = i.seasonStartMonth; updatedAt = Time.now() };
        trainingRequirements.add(Text.compare, associationId, r);
        #ok(?r)
      };
    }
  };

  /// The association's requirement, for its coordinator and members. null
  /// when none is set.
  public shared query ({ caller }) func getTrainingRequirement(associationId : Text) : async Result.Result<?TrainingRequirement, GetRequirementError> {
    let rec = switch (associations.get(Text.compare, associationId)) {
      case (?r) r;
      case null return #err(#associationNotFound);
    };
    if (rec.coordinator != caller and not isMember(associationId, caller)) return #err(#notAuthorized);
    #ok(trainingRequirements.get(Text.compare, associationId))
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

  /// For other canisters (content's clip library): an official's place in
  /// an association.
  public query func membershipOf(associationId : Text, p : Principal) : async { #none; #member; #coordinator } {
    switch (Map.get(associations, Text.compare, associationId)) {
      case (?rec) { if (rec.coordinator == p) #coordinator else if (isMember(associationId, p)) #member else #none };
      case null #none;
    }
  };

  /// For other canisters: the associations `p` coordinates.
  public query func coordinatedBy(p : Principal) : async [Text] {
    let out = List.empty<Text>();
    for ((id, rec) in Map.entries(associations)) { if (rec.coordinator == p) List.add(out, id) };
    List.toArray(out)
  };

  // ─── Seat licenses (issue #78) ─────────────────────────────────────────────
  //
  // A per-seat license, bought on the web through Stripe Checkout or granted
  // by an admin, unlocks the coordinator features once the paywall is on
  // (assignments, training requirements, transcripts, readiness), and gives
  // each seat holder Pro: this canister pushes the holders to the user
  // canister (syncAssociationSeats), which keeps accessFor a plain query.
  // The rules live in lib/License.mo. With the paywall off nothing changes.

  public type LicenseInfo = License.License;

  public type LicenseView = {
    license       : ?LicenseInfo;
    active        : Bool;
    paywallOn     : Bool;
    holders       : [Principal];
    memberCount   : Nat; // not counting the coordinator
    minSeats      : Nat;
    checkoutReady : Bool;
  };

  public type LicenseAccessError = { #associationNotFound; #notCoordinator };
  public type LicenseAdminError = { #notAdmin; #associationNotFound; #invalidConfig };
  public type CheckoutError = { #associationNotFound; #notCoordinator; #tooFewSeats; #notConfigured; #stripeUnavailable };
  public type LicenseClaimError = {
    #associationNotFound;
    #notCoordinator;
    #invalidSession;
    #notConfigured;
    #stripeUnavailable;
    #notYours;
    #notComplete;
    #notSubscription;
    #notActive;
    #alreadyClaimed;
    #tooFewSeats;
    #malformed;
  };
  public type MoveSeatError = { #associationNotFound; #notCoordinator; #noSeat; #notMember; #alreadyHasSeat };

  /// A coordinator's standing with a member, for the user and exam canisters
  /// (transcripts, readiness): #active when an association of theirs that
  /// the member is in has an active license, #lapsed when one only had one
  /// (its data stays readable), #unlicensed when none ever had one, #none
  /// when they don't coordinate the member at all.
  public type CoordinatorLicense = { #none; #unlicensed; #lapsed; #active };

  public type StripeConfig = { key : Text; priceId : Text; appUrl : Text };

  var adminPrincipal : ?Principal = null;
  // The user canister's copy of its paywall switch (setPaywallFlag).
  var paywallOn : Bool = false;
  let licenses : Map.Map<Text, LicenseInfo> = Map.empty<Text, LicenseInfo>();
  // associationId -> who holds its seats, in seat order (License.fillSeats).
  let seatHolders : Map.Map<Text, [Principal]> = Map.empty<Text, [Principal]>();
  // Associations whose seat holders the user canister hasn't taken yet.
  let seatSyncPending : Set.Set<Text> = Set.empty<Text>();
  // Lapsed licenses whose seats have already been taken away.
  let lapseCleaned : Set.Set<Text> = Set.empty<Text>();
  // Each association gets one trial.
  let trialUsed : Set.Set<Text> = Set.empty<Text>();
  // Stripe subscription id -> the association it pays for, so one
  // subscription can't license two associations.
  let licenseSubscriptions : Map.Map<Text, Text> = Map.empty<Text, Text>();
  // The Stripe key needs read access to Checkout Sessions and Subscriptions
  // and write access to Checkout Sessions (to start one with the seat
  // count), nothing that moves money: outcall headers are visible to node
  // providers. Never returned by any method.
  var stripeConfig : ?StripeConfig = null;

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null {
        // Bootstrap is controller-only, so nobody can claim admin on a freshly
        // deployed canister before its deployer does (canister-security skill).
        if (not Principal.isController(caller)) return #err("Only a canister controller can set the first admin");
        adminPrincipal := ?p;
        #ok(())
      };
      case (?a) {
        if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized")
      };
    }
  };

  func isAdmin(p : Principal) : Bool = adminPrincipal == ?p;

  public shared query ({ caller }) func isAdminCaller() : async Bool { isAdmin(caller) };

  func licenseOf(id : Text) : ?LicenseInfo = licenses.get(Text.compare, id);

  func licensed(id : Text) : Bool = License.allowed(paywallOn, licenseOf(id), Time.now());

  func membersOf(id : Text) : [Principal] = switch (Map.get(members, Text.compare, id)) { case (?ms) ms; case null [] };

  func startTrial(id : Text) {
    if (trialUsed.contains(Text.compare, id) or licenses.get(Text.compare, id) != null) return;
    trialUsed.add(Text.compare, id);
    setLicense(id, License.trial(Time.now()));
  };

  func setLicense(id : Text, l : LicenseInfo) {
    licenses.add(Text.compare, id, l);
    if (l.expiresAt > Time.now()) lapseCleaned.remove(Text.compare, id);
    ignore refreshSeats(id);
    seatSyncPending.add(Text.compare, id);
  };

  /// Recomputes who holds the association's seats. True when the user
  /// canister needs telling (always marked pending).
  func refreshSeats(id : Text) : Bool {
    let current = switch (seatHolders.get(Text.compare, id)) { case (?h) h; case null [] };
    let next = switch (associations.get(Text.compare, id)) {
      case (?rec) {
        let seats = switch (licenseOf(id)) { case (?l) l.seats; case null 0 };
        License.fillSeats(current, membersOf(id), rec.coordinator, seats)
      };
      case null [];
    };
    if (next.size() == 0) seatHolders.remove(Text.compare, id) else seatHolders.add(Text.compare, id, next);
    let changed = next != current;
    if (changed) seatSyncPending.add(Text.compare, id);
    changed or seatSyncPending.contains(Text.compare, id)
  };

  func view(id : Text, rec : AssociationRec) : LicenseView {
    let l = licenseOf(id);
    {
      license = l;
      active = License.isActive(l, Time.now());
      paywallOn;
      holders = switch (seatHolders.get(Text.compare, id)) { case (?h) h; case null [] };
      memberCount = membersOf(id).filter(func m = m != rec.coordinator).size();
      minSeats = License.MIN_SEATS;
      checkoutReady = stripeConfig != null;
    }
  };

  func coordinated(id : Text, caller : Principal) : { #ok : AssociationRec; #err : LicenseAccessError } {
    switch (associations.get(Text.compare, id)) {
      case (?rec) { if (rec.coordinator == caller or isAdmin(caller)) #ok(rec) else #err(#notCoordinator) };
      case null #err(#associationNotFound);
    }
  };

  // ─── Seat sync to the user canister ────────────────────────────────────────

  type UserSeats = actor { syncAssociationSeats : shared (Text, [Principal], Int) -> async Result.Result<(), { #notSibling }> };

  /// Tells the user canister who holds `id`'s seats: the holders while the
  /// license is active (Pro until it expires), nobody once it isn't. On
  /// failure it stays pending and the retry timer picks it up.
  func pushSeats<system>(id : Text) : async* () {
    let userId = switch (Env.canisterId<system>("user")) { case (?u) u; case null return };
    let (holders, until) = switch (licenseOf(id)) {
      case (?l) {
        if (l.expiresAt > Time.now() and associations.get(Text.compare, id) != null) {
          (switch (seatHolders.get(Text.compare, id)) { case (?h) h; case null [] }, l.expiresAt)
        } else ([], l.expiresAt)
      };
      case null ([], 0);
    };
    let ok = try {
      switch (await (actor (userId.toText()) : UserSeats).syncAssociationSeats(id, holders, until)) { case (#ok) true; case (#err(_)) false }
    } catch (_ : Error.Error) false;
    // Something may have changed while the call was out; only a push of
    // the current state clears the flag.
    let current = switch (seatHolders.get(Text.compare, id)) { case (?h) h; case null [] };
    if (ok and (holders.size() == 0 or current == holders)) seatSyncPending.remove(Text.compare, id)
    else if (not flushing) armSeatSync<system>(0);
  };

  transient var seatTimer : ?Timer.TimerId = null;
  transient var syncAttempts : Nat = 0;
  transient var flushing : Bool = false;

  func armSeatSync<system>(attempt : Nat) {
    if (seatTimer != null) return;
    // 0 s, then 1, 2, 4 ... minutes, at most hourly.
    let delayNs = if (attempt == 0) 0 else 60_000_000_000 * Nat.pow(2, Nat.min(attempt - 1, 6));
    seatTimer := ?Timer.setTimer<system>(#nanoseconds delayNs, func() : async () { await flushSeatSync() });
  };

  func flushSeatSync() : async () {
    seatTimer := null;
    flushing := true;
    let due = seatSyncPending.values().toArray();
    for (id in due.values()) { await* pushSeats<system>(id) };
    flushing := false;
    if (seatSyncPending.isEmpty()) syncAttempts := 0 else {
      syncAttempts += 1;
      armSeatSync<system>(syncAttempts);
    };
  };

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /// From the user canister's setPaywallEnabled. Switching it on starts the
  /// 30-day trial for every association that has never had a license.
  public shared ({ caller }) func setPaywallFlag(on : Bool) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    paywallOn := on;
    if (on) {
      for (id in associations.keys()) startTrial(id);
      if (not seatSyncPending.isEmpty()) armSeatSync<system>(0);
    };
    #ok(())
  };

  /// A license granted by hand (invoices, POs, test accounts), until
  /// `until` (nanoseconds). Any number of seats. Replaces the current one.
  public shared ({ caller }) func grantLicense(associationId : Text, seats : Nat, until : Int) : async Result.Result<LicenseInfo, LicenseAdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    if (associations.get(Text.compare, associationId) == null) return #err(#associationNotFound);
    let l : LicenseInfo = { seats; source = #manual; expiresAt = until; updatedAt = Time.now() };
    setLicense(associationId, l);
    await* pushSeats<system>(associationId);
    #ok(l)
  };

  /// Removes the license (not the Stripe subscription: cancel that in
  /// Stripe). Its seat holders lose the Pro it gave them.
  public shared ({ caller }) func revokeLicense(associationId : Text) : async Result.Result<(), LicenseAdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    if (associations.get(Text.compare, associationId) == null) return #err(#associationNotFound);
    switch (licenses.take(Text.compare, associationId)) {
      case (?{ source = #stripe sub }) licenseSubscriptions.remove(Text.compare, sub);
      case _ {};
    };
    ignore refreshSeats(associationId);
    seatSyncPending.add(Text.compare, associationId);
    await* pushSeats<system>(associationId);
    #ok(())
  };

  /// Stripe for license checkout: a restricted key (see stripeConfig), the
  /// per-seat yearly Price, and the app's https origin that Checkout returns
  /// to. null switches checkout off.
  public shared ({ caller }) func setLicenseStripe(config : ?StripeConfig) : async Result.Result<(), LicenseAdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    switch config {
      case (?c) {
        let origin = c.appUrl.trimEnd(#char '/');
        if (c.key == "" or not Billing.validStripeId("price_", c.priceId) or not validOrigin(origin)) return #err(#invalidConfig);
        stripeConfig := ?{ c with appUrl = origin };
      };
      case null stripeConfig := null;
    };
    #ok(())
  };

  func validOrigin(o : Text) : Bool {
    if (not o.startsWith(#text "https://") or o.size() > 200) return false;
    for (ch in o.chars()) {
      if (not ((ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9') or ch == '.' or ch == '-' or ch == ':' or ch == '/')) return false;
    };
    true
  };

  // ─── Coordinators ──────────────────────────────────────────────────────────

  public shared query ({ caller }) func getLicense(associationId : Text) : async Result.Result<LicenseView, LicenseAccessError> {
    switch (coordinated(associationId, caller)) { case (#ok(rec)) #ok(view(associationId, rec)); case (#err(e)) #err(e) }
  };

  /// Moves a seat (and the Pro it carries) from one member to another.
  public shared ({ caller }) func moveSeat(associationId : Text, from : Principal, to : Principal) : async Result.Result<LicenseView, MoveSeatError> {
    let rec = switch (coordinated(associationId, caller)) { case (#ok(r)) r; case (#err(#associationNotFound)) return #err(#associationNotFound); case (#err(#notCoordinator)) return #err(#notCoordinator) };
    let holders = switch (seatHolders.get(Text.compare, associationId)) { case (?h) h; case null [] };
    switch (License.moveSeat(holders, membersOf(associationId), from, to)) {
      case (#ok(next)) {
        seatHolders.add(Text.compare, associationId, next);
        seatSyncPending.add(Text.compare, associationId);
        await* pushSeats<system>(associationId);
        #ok(view(associationId, rec))
      };
      case (#err(e)) #err(e);
    }
  };

  /// Starts a Stripe Checkout for `seats` seats (10 or more) of the yearly
  /// per-seat Price and returns its URL. The seat count that counts is the
  /// one on the subscription Stripe creates, read back by claimLicense.
  public shared ({ caller }) func startLicenseCheckout(associationId : Text, seats : Nat) : async Result.Result<Text, CheckoutError> {
    switch (associations.get(Text.compare, associationId)) {
      case (?rec) { if (rec.coordinator != caller) return #err(#notCoordinator) };
      case null return #err(#associationNotFound);
    };
    if (not License.enoughSeats(seats) or seats > 10_000) return #err(#tooFewSeats);
    let cfg = switch stripeConfig { case (?c) c; case null return #err(#notConfigured) };
    let back = cfg.appUrl # "/association/" # associationId # "/license";
    let form = [
      ("mode", "subscription"),
      ("line_items[0][price]", cfg.priceId),
      ("line_items[0][quantity]", seats.toText()),
      ("client_reference_id", License.reference(associationId, caller.toText())),
      ("subscription_data[metadata][association]", associationId),
      ("success_url", back # "?session_id={CHECKOUT_SESSION_ID}"),
      ("cancel_url", back),
    ];
    let body = form.map(func((k, v) : (Text, Text)) : Text = formEncode(k) # "=" # formEncode(v)).values().join("&");
    // One replica makes it (each would otherwise start its own session);
    // nothing is granted from this answer, only from claimLicense's
    // replicated reads.
    let resp = try {
      await Call.httpRequest(STRIPE_API # "checkout/sessions")
        .withMethod(#post)
        .withHeader("Authorization", "Bearer " # cfg.key)
        .withHeader("Stripe-Version", STRIPE_VERSION)
        .withHeader("Content-Type", "application/x-www-form-urlencoded")
        .withBody(body.encodeUtf8())
        .withMaxResponseBytes(STRIPE_MAX_RESPONSE_BYTES)
        .nonReplicated()
        .send()
    } catch (_) { return #err(#stripeUnavailable) };
    if (resp.status != 200) return #err(#stripeUnavailable);
    let url = switch (resp.body.decodeUtf8()) {
      case (?t) switch (Json.fields(t)) { case (?f) Json.getText(f, "url"); case null null };
      case null null;
    };
    switch url {
      case (?u) { if (u.startsWith(#text "https://checkout.stripe.com/")) #ok(u) else #err(#stripeUnavailable) };
      case null #err(#stripeUnavailable);
    }
  };

  func formEncode(t : Text) : Text {
    let hex = "0123456789ABCDEF".toArray();
    var out = "";
    for (b in t.encodeUtf8().values()) {
      let c = b.toNat();
      if ((c >= 48 and c <= 57) or (c >= 65 and c <= 90) or (c >= 97 and c <= 122) or c == 45 or c == 46 or c == 95 or c == 126) {
        out #= Nat.toNat32(c).toChar().toText();
      } else out #= "%" # hex[c / 16].toText() # hex[c % 16].toText();
    };
    out
  };

  // ─── Stripe reads ──────────────────────────────────────────────────────────
  //
  // Replicated GETs (every node fetches and they must agree), reduced by the
  // transform to the fields the rules read, as the user canister does for
  // Pro (claimWebSubscription).

  transient let STRIPE_API : Text = "https://api.stripe.com/v1/";
  // Pinned so `current_period_end` stays on the Subscription object.
  transient let STRIPE_VERSION : Text = "2024-06-20";
  transient let STRIPE_MAX_RESPONSE_BYTES : Nat64 = 64_000;

  public query func transformLicenseStripe({ context : Blob; response : IC.HttpRequestResult }) : async IC.HttpRequestResult {
    let body = switch (response.body.decodeUtf8()) {
      case (?t) { if (context == "session".encodeUtf8()) Json.project(t, Billing.SESSION_FIELDS) else License.canonicalSubscription(t) };
      case null "{}";
    };
    { status = response.status; headers = []; body = body.encodeUtf8() }
  };

  type StripeResult = { #ok : Text; #notFound; #unavailable };

  func stripeGet(key : Text, path : Text, kind : Text) : async StripeResult {
    let resp = try {
      await Call.httpRequest(STRIPE_API # path)
        .withMethod(#get)
        .withHeader("Authorization", "Bearer " # key)
        .withHeader("Stripe-Version", STRIPE_VERSION)
        .withMaxResponseBytes(STRIPE_MAX_RESPONSE_BYTES)
        .withTransform({ function = transformLicenseStripe; context = kind.encodeUtf8() })
        .withExpectedRoundtripTimeMs(10_000)
        .withExpectedTransformInstructions(50_000_000)
        .send()
    } catch (_) { return #unavailable };
    if (resp.status == 404) return #notFound;
    if (resp.status != 200) return #unavailable;
    switch (resp.body.decodeUtf8()) { case (?t) #ok(t); case null #unavailable }
  };

  /// Licenses the association from a finished Stripe Checkout: the caller
  /// coordinates it, the session names them and this association, is
  /// complete and started a subscription nobody has claimed, and that
  /// subscription is active with at least 10 seats.
  public shared ({ caller }) func claimLicense(associationId : Text, sessionId : Text) : async Result.Result<LicenseView, LicenseClaimError> {
    switch (associations.get(Text.compare, associationId)) {
      case (?rec) { if (rec.coordinator != caller) return #err(#notCoordinator) };
      case null return #err(#associationNotFound);
    };
    if (not Billing.validStripeId("cs_", sessionId)) return #err(#invalidSession);
    let cfg = switch stripeConfig { case (?c) c; case null return #err(#notConfigured) };
    let sessionJson = switch (await stripeGet(cfg.key, "checkout/sessions/" # sessionId, "session")) {
      case (#ok(t)) t;
      case (#notFound) return #err(#invalidSession);
      case (#unavailable) return #err(#stripeUnavailable);
    };
    let subId = switch (License.claimCheck(sessionJson, associationId, caller.toText())) {
      case (#ok(id)) id;
      case (#err(e)) return #err(e);
    };
    if (claimedElsewhere(subId, associationId)) return #err(#alreadyClaimed);
    let subJson = switch (await stripeGet(cfg.key, "subscriptions/" # subId, "subscription")) {
      case (#ok(t)) t;
      case (#notFound) return #err(#notSubscription);
      case (#unavailable) return #err(#stripeUnavailable);
    };
    switch (License.subscriptionState(subJson)) {
      case (?#renew({ until; seats })) {
        if (not License.enoughSeats(seats)) return #err(#tooFewSeats);
        // Re-checked after the awaits: things may have moved meanwhile.
        if (claimedElsewhere(subId, associationId)) return #err(#alreadyClaimed);
        let rec = switch (associations.get(Text.compare, associationId)) { case (?r) r; case null return #err(#associationNotFound) };
        if (rec.coordinator != caller) return #err(#notCoordinator);
        licenseSubscriptions.add(Text.compare, subId, associationId);
        setLicense(associationId, { seats; source = #stripe subId; expiresAt = until; updatedAt = Time.now() });
        lastLicenseCheck.add(Text.compare, associationId, Time.now());
        await* pushSeats<system>(associationId);
        #ok(view(associationId, rec))
      };
      case (?#pending or ?#ended) #err(#notActive);
      case null #err(#malformed);
    }
  };

  func claimedElsewhere(subId : Text, associationId : Text) : Bool =
    switch (licenseSubscriptions.get(Text.compare, subId)) { case (?a) a != associationId; case null false };

  /// Re-reads the association's Stripe subscription now (after a seat
  /// change in the customer portal, say) rather than at the next daily
  /// check. At most once a minute.
  public shared ({ caller }) func refreshLicense(associationId : Text) : async Result.Result<LicenseView, LicenseClaimError> {
    let rec = switch (associations.get(Text.compare, associationId)) {
      case (?r) { if (r.coordinator != caller) return #err(#notCoordinator); r };
      case null return #err(#associationNotFound);
    };
    switch (licenseOf(associationId)) {
      case (?{ source = #stripe _ }) {
        let recent = switch (lastLicenseCheck.get(Text.compare, associationId)) { case (?t) t > Time.now() - 60_000_000_000; case null false };
        if (not recent) await* checkLicense<system>(associationId);
      };
      case _ {};
    };
    #ok(view(associationId, rec))
  };

  // ─── Renewals and lapses ───────────────────────────────────────────────────
  //
  // An hourly timer re-reads Stripe licenses (License.needsCheck: daily
  // mid-period, hourly near expiry), at most RENEWAL_BATCH a run, applying
  // renewals, seat changes and cancellations without a webhook, and takes
  // the seats' Pro away from licenses past their grace period.

  transient let RENEWAL_BATCH : Nat = 20;
  transient let lastLicenseCheck : Map.Map<Text, Int> = Map.empty<Text, Int>();

  func checkLicense<system>(id : Text) : async* () {
    let cfg = switch stripeConfig { case (?c) c; case null return };
    let subId = switch (licenseOf(id)) { case (?{ source = #stripe s }) s; case _ return };
    lastLicenseCheck.add(Text.compare, id, Time.now());
    switch (await stripeGet(cfg.key, "subscriptions/" # subId, "subscription")) {
      case (#ok(json)) {
        switch (License.subscriptionState(json)) {
          case (?#renew({ until; seats })) {
            // Still this association's subscription? (It may have been
            // revoked or the association deleted meanwhile.)
            if (licenseSubscriptions.get(Text.compare, subId) == ?id) {
              switch (licenseOf(id)) {
                case (?{ source = #stripe s }) {
                  if (s == subId) {
                    setLicense(id, { seats; source = #stripe subId; expiresAt = until; updatedAt = Time.now() });
                    await* pushSeats<system>(id);
                  };
                };
                case _ {};
              };
            };
          };
          // Payment being retried, or canceled: the license runs to its
          // current expiry.
          case _ {};
        };
      };
      case _ {};
    };
  };

  func renewLicenses() : async () {
    let now = Time.now();
    let due = List.empty<Text>();
    for ((id, l) in licenses.entries()) {
      if (due.size() < RENEWAL_BATCH and License.needsCheck(l, lastLicenseCheck.get(Text.compare, id), now)) due.add(id);
      if (License.lapsed(l, now) and not lapseCleaned.contains(Text.compare, id)) {
        lapseCleaned.add(Text.compare, id);
        seatSyncPending.add(Text.compare, id);
      };
    };
    for (id in due.values()) { await* checkLicense<system>(id) };
    if (not seatSyncPending.isEmpty()) armSeatSync<system>(0);
  };

  transient let _renewalTimer : Timer.TimerId = Timer.recurringTimer<system>(#seconds 3600, renewLicenses);
  // Timers don't survive an upgrade: pick up seat pushes still owed.
  transient let _resumeTimer : Timer.TimerId = Timer.setTimer<system>(#seconds 0, func() : async () {
    if (not seatSyncPending.isEmpty()) await flushSeatSync();
  });

  // ─── For other canisters ───────────────────────────────────────────────────

  public query func coordinatorLicense(coordinator : Principal, member : Principal) : async CoordinatorLicense {
    let ids = switch (Map.get(myAssociations, Principal.compare, member)) { case (?a) a; case null [] };
    let now = Time.now();
    var best : CoordinatorLicense = #none;
    for (id in ids.values()) {
      switch (Map.get(associations, Text.compare, id)) {
        case (?rec) {
          if (rec.coordinator == coordinator) {
            let standing : CoordinatorLicense = switch (licenseOf(id)) {
              case (?l) { if (l.expiresAt > now) #active else #lapsed };
              case null #unlicensed;
            };
            best := switch (best, standing) {
              case (#active, _) #active;
              case (_, #active) #active;
              case (#lapsed, _) #lapsed;
              case (_, #lapsed) #lapsed;
              case _ #unlicensed;
            };
          };
        };
        case null {};
      };
    };
    best
  };

  // ─── Leaving ───────────────────────────────────────────────────────────────

  /// A member leaves an association (the coordinator can't). Their seat,
  /// if they had one, goes to the next member in join order.
  public shared ({ caller }) func leaveAssociation(associationId : Text) : async Result.Result<(), Text> {
    let rec = switch (associations.get(Text.compare, associationId)) { case (?r) r; case null return #err("Association not found") };
    if (rec.coordinator == caller) return #err("The coordinator can't leave their own association");
    if (not isMember(associationId, caller)) return #err("Not a member");
    Map.add(members, Text.compare, associationId, membersOf(associationId).filter(func m = m != caller));
    switch (Map.get(myAssociations, Principal.compare, caller)) {
      case (?ids) Map.add(myAssociations, Principal.compare, caller, ids.filter(func x = x != associationId));
      case null {};
    };
    if (refreshSeats(associationId)) await* pushSeats<system>(associationId);
    #ok(())
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
      // Their seat goes to the next member; pushed by the timer, since the
      // user canister is waiting on this call.
      ignore refreshSeats(id);
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
      trainingRequirements.remove(Text.compare, id);
      // The association is gone, so its seats carry nothing any more.
      ignore licenses.take(Text.compare, id);
      seatHolders.remove(Text.compare, id);
      seatSyncPending.add(Text.compare, id);
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
    if (not seatSyncPending.isEmpty()) armSeatSync<system>(0);
    #ok(())
  };

  public query func metrics() : async { associationCount : Nat; assignmentCount : Nat; licensedAssociations : Nat; totalSeats : Nat; trials : Nat } {
    let now = Time.now();
    var licensedAssociations = 0; var totalSeats = 0; var trials = 0;
    for (l in licenses.values()) {
      if (l.expiresAt > now) {
        if (l.source == #trial) trials += 1 else { licensedAssociations += 1; totalSeats += l.seats };
      };
    };
    { associationCount = Map.size(associations); assignmentCount = Map.size(assignments); licensedAssociations; totalSeats; trials }
  };
}
