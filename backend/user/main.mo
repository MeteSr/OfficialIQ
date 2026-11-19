import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Set "mo:core/Set";
import Env "../lib/Env";
import Timer "mo:core/Timer";
import Error "mo:core/Error";
import List "mo:core/List";
import Stored "Stored";
import Training "../lib/Training";
import Billing "../lib/Billing";
import Json "../lib/Json";
import Blob "mo:core/Blob";
import Call "mo:ic/Call";
import IC "mo:ic/Types";

persistent actor User {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Role = {
    #Official;
    #Assessor;
    #Admin;
    #Coordinator;
  };

  public type Profile = {
    principal        : Principal;
    displayName      : Text;
    role             : Role;
    sport            : Text;
    level            : Text;
    state            : Text;
    preferredLanguage : Text; // ISO 639-1, e.g. "en", "es" — issue #27
    createdAt        : Int;
  };

  public type ProfileUpdate = {
    displayName       : Text;
    sport             : Text;
    level             : Text;
    state             : Text;
    preferredLanguage : Text;
  };

  public type StudyPace = {
    articlesPerWeek : Nat;
    startDate       : Int;
  };

  public type ArticleProgress = {
    articleId    : Text;
    lastStudied  : Int;
    timesStudied : Nat;
    masteryScore : Nat;
  };

  public type WeeklySchedule = {
    dueThisWeek : [Text];
    overdue     : [Text];
    weekNumber  : Nat;
  };

  public type WeeklyQuizResult = {
    weekNumber     : Nat;
    newScore       : Nat;
    retentionScore : Nat;
    completedAt    : Int;
  };

  public type MonthlyQuizResult = {
    month         : Nat; // YYYYMM, e.g. 202608
    score         : Nat;
    articleScores : [(Text, Nat)];
    completedAt   : Int;
  };

  // Assigning-platform integrations (issue #25). ArbiterSports/RefTown have
  // no public API as of this writing (partnership required — see the
  // follow-up issue), so linking is ID-based only: the official pastes in
  // their existing external account id, nothing is verified or synced
  // automatically. "provider" is a free-form label (e.g. "ArbiterSports",
  // "RefTown") so new platforms don't need a schema change to add.
  public type LinkedAccount = {
    provider   : Text;
    externalId : Text;
    linkedAt   : Int;
  };

  // Manually-entered upcoming games, standing in for the real schedule pull
  // an assigning-platform webhook would eventually provide.
  public type UpcomingGame = {
    id        : Text;
    opponent  : Text;
    gameDate  : Int;
    sportId   : Text;
    levelId   : Text;
    notes     : Text;
    createdAt : Int;
  };

  public type UpcomingGameInput = {
    opponent : Text;
    gameDate : Int;
    sportId  : Text;
    levelId  : Text;
    notes    : Text;
  };

  // Web Push (browser/PWA) and native (Capacitor push-notifications plugin
  // on iOS/Android — issue #31) both funnel into the same subscription slot
  // per user, so the send relay (scripts/send-pending-push.mjs) doesn't need
  // to know which path registered it.
  public type PushSubscription = {
    #WebPush : { endpoint : Text; p256dh : Text; auth : Text };
    #Native  : { token : Text; platform : Text }; // platform: "ios" | "android"
  };

  // ─── State ────────────────────────────────────────────────────────────────

  // Stored profiles (Stored.mo); the API returns them through view().
  type StoredProfile = Stored.Profile;
  var profiles           : Map.Map<Principal, StoredProfile> = Map.empty<Principal, StoredProfile>();

  /// A stored profile as the API returns it. The identity while the two
  /// types have the same fields; when one changes, the compiler asks here.
  func view(p : StoredProfile) : Profile = p;
  func viewOpt(p : ?StoredProfile) : ?Profile = switch p { case (?x) ?view(x); case null null };
  func fromRole(r : Role) : Stored.Role = r;
  var studyPaces          : Map.Map<Principal, StudyPace> = Map.empty<Principal, StudyPace>();
  var progress            : Map.Map<Principal, [ArticleProgress]> = Map.empty<Principal, [ArticleProgress]>();
  var weeklyQuizHistory   : Map.Map<Principal, [WeeklyQuizResult]> = Map.empty<Principal, [WeeklyQuizResult]>();
  var monthlyQuizHistory  : Map.Map<Principal, [MonthlyQuizResult]> = Map.empty<Principal, [MonthlyQuizResult]>();
  var linkedAccounts     : Map.Map<Principal, [LinkedAccount]> = Map.empty<Principal, [LinkedAccount]>();
  var upcomingGames      : Map.Map<Principal, [UpcomingGame]> = Map.empty<Principal, [UpcomingGame]>();
  var pushSubscriptions  : Map.Map<Principal, PushSubscription> = Map.empty<Principal, PushSubscription>();

  var nextGameId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  let WEEK_NS : Nat = 7 * 24 * 3600 * 1_000_000_000;

  // ─── Admin guard ──────────────────────────────────────────────────────────
  // Existing mutations here are all self-service (caller-scoped) — this is
  // only needed for getSubscriptionFor(p), which the push relay script uses
  // and which is sensitive enough (a live push endpoint, unlike public
  // leaderboard stats) that it shouldn't be a public-by-principal query.

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null {
        // Bootstrap is controller-only, so nobody can claim admin on a freshly
        // deployed canister before its deployer does (canister-security skill).
        if (not Principal.isController(caller)) return #err("Only a canister controller can set the first admin");
        adminPrincipal := ?p;
        #ok(())
      };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  // ─── Push relay identity ──────────────────────────────────────────────────
  // The scheduled push relay (scripts/send-pending-push.mjs) gets its own
  // principal that can only read push subscriptions — not the admin or
  // controller identity, so a leak of the relay's key exposes push endpoints
  // and nothing else.
  var pushRelayPrincipal : ?Principal = null;

  public shared ({ caller }) func setPushRelay(p : ?Principal) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    pushRelayPrincipal := p;
    #ok(())
  };

  func isPushRelay(p : Principal) : Bool {
    switch pushRelayPrincipal { case (?r) r == p; case null false }
  };

  // ─── Roles ────────────────────────────────────────────────────────────────
  // Coordinator (and Admin/Assessor) roles are granted by the app admin; the
  // association canister asks isCoordinator before letting someone create an
  // association.
  public shared ({ caller }) func setRole(p : Principal, role : Role) : async Result.Result<Profile, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (Map.get(profiles, Principal.compare, p)) {
      case null #err("Profile not found");
      case (?existing) {
        let updated : StoredProfile = { existing with role = fromRole(role) };
        Map.add(profiles, Principal.compare, p, updated);
        #ok(view(updated))
      };
    }
  };

  public query func isCoordinator(p : Principal) : async Bool {
    if (isAdmin(p)) return true;
    switch (Map.get(profiles, Principal.compare, p)) {
      case (?pr) { switch (pr.role) { case (#Coordinator or #Admin) true; case _ false } };
      case null false;
    }
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  // Profile fields are shown to other users (leaderboards, groups), so keep
  // them to a sane size.
  let MAX_FIELD_CHARS : Nat = 100;

  func validProfile(req : ProfileUpdate) : Bool {
    Text.size(req.displayName) <= MAX_FIELD_CHARS and Text.size(req.sport) <= MAX_FIELD_CHARS and
    Text.size(req.level) <= MAX_FIELD_CHARS and Text.size(req.state) <= MAX_FIELD_CHARS and
    Text.size(req.preferredLanguage) <= 16
  };

  public shared ({ caller }) func createProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (not validProfile(req)) return #err("Profile field too long");
    if (Map.get(profiles, Principal.compare, caller) != null) return #err("Profile already exists");
    refreshEnv<system>();
    // Otherwise the erasure still running would delete the new account's
    // data in the other canisters.
    if (Map.get(erasures, Principal.compare, caller) != null) return #err("Your old account is still being deleted. Try again in a few minutes.");

    let p : StoredProfile = {
      principal         = caller;
      displayName       = req.displayName;
      role              = #Official;
      sport             = req.sport;
      level             = req.level;
      state             = req.state;
      preferredLanguage = if (req.preferredLanguage == "") "en" else req.preferredLanguage;
      createdAt         = Time.now();
    };
    Map.add(profiles, Principal.compare, caller, p);
    #ok(view(p))
  };

  public shared ({ caller }) func updateProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (not validProfile(req)) return #err("Profile field too long");
    switch (Map.get(profiles, Principal.compare, caller)) {
      case null { #err("Profile not found") };
      case (?existing) {
        let updated : StoredProfile = { existing with
          displayName       = req.displayName;
          sport             = req.sport;
          level             = req.level;
          state             = req.state;
          preferredLanguage = if (req.preferredLanguage == "") "en" else req.preferredLanguage;
        };
        Map.add(profiles, Principal.compare, caller, updated);
        // The leaderboards copy name and state; tell ranking (fire and
        // forget: it also re-reads them at the next exam).
        if (updated.displayName != existing.displayName or updated.state != existing.state) {
          switch (Env.canisterId<system>("ranking")) {
            case (?id) {
              let ranking = actor (Principal.toText(id)) : actor { profileChanged : shared (Principal, Text, Text) -> async () };
              ignore ranking.profileChanged(caller, updated.displayName, updated.state);
            };
            case null {};
          };
        };
        #ok(view(updated))
      };
    }
  };

  // No longer self-service: the coordinator role is granted by an admin
  // (setRole). Kept so existing clients get a clear error rather than a
  // missing-method rejection.
  public shared func becomeCoordinator() : async Result.Result<Profile, Text> {
    #err("Coordinator access is granted by an OfficialIQ admin")
  };

  public shared ({ caller }) func setStudyPace(articlesPerWeek : Nat) : async Result.Result<StudyPace, Text> {
    if (articlesPerWeek == 0) return #err("Must study at least 1 article per week");
    let pace : StudyPace = switch (Map.get(studyPaces, Principal.compare, caller)) {
      case (?existing) { { articlesPerWeek; startDate = existing.startDate } };
      case null { { articlesPerWeek; startDate = Time.now() } };
    };
    Map.add(studyPaces, Principal.compare, caller, pace);
    #ok(pace)
  };

  public shared ({ caller }) func recordArticleStudied(articleId : Text, score : Nat) : async () {
    if (Principal.isAnonymous(caller)) Runtime.trap("Must be authenticated");
    if (score > 100) Runtime.trap("Score must be 0-100");
    studied(caller, articleId, score);
  };

  // Graded sessions the exam canister has pushed, so a retry counts once.
  var gradedStudySessions : Set.Set<Text> = Set.empty<Text>();

  /// Called by the exam canister when a quiz or exam finishes: each article
  /// in it counts as studied, scored by its accuracy in that session. Safe
  /// to repeat.
  public shared ({ caller }) func recordGradedStudy(player : Principal, sessionId : Text, articleScores : [(Text, Nat)]) : async Result.Result<(), Text> {
    switch (Env.canisterId<system>("exam")) {
      case (?id) { if (caller != id) return #err("Exam canister only") };
      case null return #err("Exam canister not configured");
    };
    if (articleScores.size() > 200) return #err("Too many articles");
    refreshEnv<system>();
    if (Set.contains(gradedStudySessions, Text.compare, sessionId)) return #ok(());
    Set.add(gradedStudySessions, Text.compare, sessionId);
    for ((articleId, score) in articleScores.values()) {
      if (score <= 100) studied(player, articleId, score);
    };
    #ok(())
  };

  func studied(caller : Principal, articleId : Text, score : Nat) {
    let existing = switch (Map.get(progress, Principal.compare, caller)) { case (?p) p; case null [] };
    let now = Time.now();
    var found = false;
    let updated = Array.map<ArticleProgress, ArticleProgress>(existing, func(p) {
      if (p.articleId == articleId) {
        found := true;
        let newTimes = p.timesStudied + 1;
        let newMastery = (p.masteryScore * p.timesStudied + score) / newTimes;
        { articleId = p.articleId; lastStudied = now; timesStudied = newTimes; masteryScore = newMastery }
      } else p
    });
    let final = if (found) updated else Array.concat<ArticleProgress>(updated, [{
      articleId; lastStudied = now; timesStudied = 1; masteryScore = score;
    }]);
    Map.add(progress, Principal.compare, caller, final);
  };

  // ─── Study time (issue #67) ────────────────────────────────────────────────
  //
  // Reading time an association can count toward its training requirement,
  // measured here rather than reported by the app: while an official has
  // study material open, the app calls recordStudyBeat about once a minute,
  // and each beat credits the time since the previous one under the rules in
  // lib/Training.mo (gap limit, daily cap, retention).

  public type StudyDay = Training.StudyDay;

  let studyDays : Map.Map<Principal, [StudyDay]> = Map.empty<Principal, [StudyDay]>();

  // When each official's last beat arrived. Transient: losing it on an
  // upgrade costs at most the minute in progress, and it never has to be
  // migrated.
  transient let lastStudyBeat : Map.Map<Principal, Int> = Map.empty<Principal, Int>();

  public shared ({ caller }) func recordStudyBeat() : async () {
    if (caller.isAnonymous()) return;
    refreshEnv<system>();
    let now = Time.now();
    let sec = Training.beatCredit(lastStudyBeat.get(Principal.compare, caller), now);
    if (sec > 0) {
      let days = switch (studyDays.get(Principal.compare, caller)) { case (?d) d; case null [] };
      studyDays.add(Principal.compare, caller, Training.addStudy(days, now, sec));
    };
    lastStudyBeat.add(Principal.compare, caller, now);
  };

  /// Everything the training transcript needs from this canister.
  public type TrainingActivity = {
    studyDays      : [StudyDay];
    weeklyQuizzes  : [WeeklyQuizResult];
    monthlyQuizzes : [MonthlyQuizResult];
  };

  public type TrainingAccessError = { #notAuthorized };

  func activityOf(p : Principal) : TrainingActivity {
    {
      studyDays      = switch (studyDays.get(Principal.compare, p)) { case (?d) d; case null [] };
      weeklyQuizzes  = switch (weeklyQuizHistory.get(Principal.compare, p)) { case (?h) h; case null [] };
      monthlyQuizzes = switch (monthlyQuizHistory.get(Principal.compare, p)) { case (?h) h; case null [] };
    }
  };

  public shared query ({ caller }) func getMyTrainingActivity() : async TrainingActivity {
    activityOf(caller)
  };

  // A query can't read canister environment variables, so update calls copy
  // the association canister's id here (as the exam canister does). Stable,
  // so the coordinator check keeps working right after an upgrade.
  var ASSOCIATION_ID : ?Principal = null;
  // The sibling canisters allowed to ask accessFor / isPro.
  var SIBLING_IDS : [Principal] = [];
  transient let SIBLINGS : [Text] = ["exam", "ai_proxy", "association", "ranking", "challenge", "mentorship", "report", "question", "content"];

  func refreshEnv<system>() {
    switch (Env.canisterId<system>("association")) { case (?id) ASSOCIATION_ID := ?id; case null {} };
    let ids = List.empty<Principal>();
    for (name in SIBLINGS.values()) {
      switch (Env.canisterId<system>(name)) { case (?id) ids.add(id); case null {} };
    };
    if (ids.size() > 0) SIBLING_IDS := ids.toArray();
  };

  func isSibling(p : Principal) : Bool = SIBLING_IDS.find(func s = s == p) != null;

  // Environment variables can't be read while the canister installs, so the
  // ids are first read by a timer right after install and each upgrade,
  // then refreshed by update calls.
  transient let _envTimer : Timer.TimerId = Timer.setTimer<system>(#seconds 0, func() : async () { refreshEnv<system>() });

  type AssociationCheck = actor { isCoordinatorOf : shared query (Principal, Principal) -> async Bool };

  /// A member's training activity, for the coordinator of an association
  /// they belong to.
  public shared composite query ({ caller }) func getMemberTrainingActivity(p : Principal) : async Result.Result<TrainingActivity, TrainingAccessError> {
    if (caller != p and not isAdmin(caller)) {
      let allowed = switch (ASSOCIATION_ID) {
        case (?id) { await (actor (id.toText()) : AssociationCheck).isCoordinatorOf(caller, p) };
        case null false;
      };
      if (not allowed) return #err(#notAuthorized);
    };
    #ok(activityOf(p))
  };

  public shared ({ caller }) func recordWeeklyQuizResult(weekNumber : Nat, newScore : Nat, retentionScore : Nat) : async () {
    if (Principal.isAnonymous(caller)) Runtime.trap("Must be authenticated");
    let existing = switch (Map.get(weeklyQuizHistory, Principal.compare, caller)) { case (?h) h; case null [] };
    let entry : WeeklyQuizResult = { weekNumber; newScore; retentionScore; completedAt = Time.now() };
    Map.add(weeklyQuizHistory, Principal.compare, caller, Array.concat<WeeklyQuizResult>(existing, [entry]));
  };

  public shared ({ caller }) func recordMonthlyQuizResult(month : Nat, score : Nat, articleScores : [(Text, Nat)]) : async () {
    if (Principal.isAnonymous(caller)) Runtime.trap("Must be authenticated");
    let existing = switch (Map.get(monthlyQuizHistory, Principal.compare, caller)) { case (?h) h; case null [] };
    let entry : MonthlyQuizResult = { month; score; articleScores; completedAt = Time.now() };
    Map.add(monthlyQuizHistory, Principal.compare, caller, Array.concat<MonthlyQuizResult>(existing, [entry]));
  };

  // Replaces any existing link for the same provider (re-linking updates the
  // stored id rather than accumulating duplicates).
  public shared ({ caller }) func linkExternalAccount(provider : Text, externalId : Text) : async Result.Result<(), Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (provider == "" or externalId == "") return #err("Provider and account id are required");
    let existing = switch (Map.get(linkedAccounts, Principal.compare, caller)) { case (?a) a; case null [] };
    let withoutProvider = Array.filter<LinkedAccount>(existing, func(a) { a.provider != provider });
    let entry : LinkedAccount = { provider; externalId; linkedAt = Time.now() };
    Map.add(linkedAccounts, Principal.compare, caller, Array.concat<LinkedAccount>(withoutProvider, [entry]));
    #ok(())
  };

  public shared ({ caller }) func unlinkExternalAccount(provider : Text) : async Result.Result<(), Text> {
    let existing = switch (Map.get(linkedAccounts, Principal.compare, caller)) { case (?a) a; case null [] };
    Map.add(linkedAccounts, Principal.compare, caller, Array.filter<LinkedAccount>(existing, func(a) { a.provider != provider }));
    #ok(())
  };

  public shared ({ caller }) func addUpcomingGame(input : UpcomingGameInput) : async Result.Result<UpcomingGame, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (input.opponent == "") return #err("Opponent/matchup is required");
    let id = "g" # Nat.toText(nextGameId);
    nextGameId += 1;
    let game : UpcomingGame = {
      id;
      opponent  = input.opponent;
      gameDate  = input.gameDate;
      sportId   = input.sportId;
      levelId   = input.levelId;
      notes     = input.notes;
      createdAt = Time.now();
    };
    let existing = switch (Map.get(upcomingGames, Principal.compare, caller)) { case (?g) g; case null [] };
    Map.add(upcomingGames, Principal.compare, caller, Array.concat<UpcomingGame>(existing, [game]));
    #ok(game)
  };

  public shared ({ caller }) func removeUpcomingGame(id : Text) : async Result.Result<(), Text> {
    let existing = switch (Map.get(upcomingGames, Principal.compare, caller)) { case (?g) g; case null [] };
    Map.add(upcomingGames, Principal.compare, caller, Array.filter<UpcomingGame>(existing, func(g) { g.id != id }));
    #ok(())
  };

  public shared ({ caller }) func registerPushSubscription(sub : PushSubscription) : async Result.Result<(), Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    Map.add(pushSubscriptions, Principal.compare, caller, sub);
    #ok(())
  };

  public shared ({ caller }) func unregisterPushSubscription() : async Result.Result<(), Text> {
    Map.remove(pushSubscriptions, Principal.compare, caller);
    #ok(())
  };

  // ─── Pro entitlements (issue #71) ──────────────────────────────────────────
  //
  // Who has Pro, and until when. One official can hold several entitlements
  // (bought on the web and covered by an association, say); Pro is active
  // while any one hasn't expired. The tier rules live in lib/Billing.mo.
  // While the paywall is off (the default) everyone keeps today's limits.

  public type Entitlement = Billing.Entitlement;
  public type EntitlementSource = Billing.EntitlementSource;
  public type Access = Billing.Access;

  public type MyEntitlement = {
    tier           : { #free; #pro };
    paywallEnabled : Bool;
    entitlements   : [Entitlement];
  };

  public type AdminError = { #notAdmin };
  public type SiblingError = { #notSibling };
  public type ClaimError = {
    #notSignedIn;
    #invalidSession;
    #notConfigured;
    #stripeUnavailable;
    #notYours;
    #notComplete;
    #notSubscription;
    #notActive;
    #alreadyClaimed;
    #malformed;
  };

  let entitlements : Map.Map<Principal, [Entitlement]> = Map.empty<Principal, [Entitlement]>();
  // Stripe subscription id -> the official who claimed it, so one
  // subscription can't be claimed twice.
  let webSubscriptionOwner : Map.Map<Text, Principal> = Map.empty<Text, Principal>();
  var paywallEnabled : Bool = false;
  // Restricted Stripe key: read-only on Checkout Sessions and Subscriptions.
  // Outcall headers are visible to node providers, so it must not be able
  // to move money. Never returned by any method.
  var stripeKey : ?Text = null;

  func entitlementsOf(p : Principal) : [Entitlement] =
    switch (entitlements.get(Principal.compare, p)) { case (?es) es; case null [] };

  func sameSource(a : EntitlementSource, b : EntitlementSource) : Bool = switch (a, b) {
    case (#web x, #web y) x == y;
    case (#association x, #association y) x == y;
    case (#appStore, #appStore) true;
    case (#playStore, #playStore) true;
    case (#comp, #comp) true;
    case _ false;
  };

  /// Adds `e`, replacing an entitlement from the same source.
  func putEntitlement(p : Principal, e : Entitlement) {
    let rest = entitlementsOf(p).filter(func x = not sameSource(x.source, e.source));
    entitlements.add(Principal.compare, p, rest.concat([e]));
  };

  func dropEntitlement(p : Principal, source : EntitlementSource) {
    let rest = entitlementsOf(p).filter(func x = not sameSource(x.source, source));
    if (rest.size() == 0) entitlements.remove(Principal.compare, p) else entitlements.add(Principal.compare, p, rest);
  };

  func accessOf(p : Principal) : Access = Billing.access(paywallEnabled, entitlementsOf(p), Time.now());

  public shared query ({ caller }) func getMyEntitlement() : async MyEntitlement {
    let es = entitlementsOf(caller);
    { tier = if (Billing.isProAt(es, Time.now())) #pro else #free; paywallEnabled; entitlements = es }
  };

  /// For sibling canisters (ai_proxy, exam, and later #63/#65): what `p`
  /// gets. #paywallOff while billing is switched off.
  public shared query ({ caller }) func accessFor(p : Principal) : async Result.Result<Access, SiblingError> {
    if (not isSibling(caller)) return #err(#notSibling);
    #ok(accessOf(p))
  };

  /// For sibling canisters: whether `p` gets Pro features. True for
  /// everyone while the paywall is off.
  public shared query ({ caller }) func isPro(p : Principal) : async Result.Result<Bool, SiblingError> {
    if (not isSibling(caller)) return #err(#notSibling);
    #ok(accessOf(p) != #free)
  };

  public type PaywallError = { #notAdmin; #examNotUpdated };

  type ExamPaywall = actor { setPaywallFlag : shared Bool -> async Result.Result<(), Text> };

  /// Switches billing on or off. The exam canister keeps a copy for its
  /// plain-query history methods; if it can't be told, the switch still
  /// changes here and the call reports #examNotUpdated, so try again.
  public shared ({ caller }) func setPaywallEnabled(on : Bool) : async Result.Result<(), PaywallError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    refreshEnv<system>();
    paywallEnabled := on;
    let examId = switch (Env.canisterId<system>("exam")) { case (?id) id; case null return #err(#examNotUpdated) };
    try {
      switch (await (actor (examId.toText()) : ExamPaywall).setPaywallFlag(on)) { case (#ok) #ok(()); case (#err(_)) #err(#examNotUpdated) }
    } catch (_) { #err(#examNotUpdated) }
  };

  /// Pro for support cases, reviewers and the App Store review account,
  /// until `until` (nanoseconds). Replaces an earlier comp.
  public shared ({ caller }) func grantComp(p : Principal, until : Int) : async Result.Result<(), AdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    putEntitlement(p, { tier = #pro; source = #comp; expiresAt = until; updatedAt = Time.now() });
    #ok(())
  };

  public shared ({ caller }) func revokeComp(p : Principal) : async Result.Result<(), AdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    dropEntitlement(p, #comp);
    #ok(())
  };

  public shared ({ caller }) func setStripeKey(key : ?Text) : async Result.Result<(), AdminError> {
    if (not isAdmin(caller)) return #err(#notAdmin);
    stripeKey := key;
    #ok(())
  };

  // ─── Stripe (web checkout) ─────────────────────────────────────────────────
  //
  // No webhook: after Stripe Checkout redirects back, the app calls
  // claimWebSubscription with the session id, and this canister asks Stripe
  // itself. These outcalls grant Pro, so they're replicated (every node
  // fetches and they must agree) rather than trusting one node, with a
  // transform that keeps only the fields the rules read
  // (Billing.SESSION_FIELDS / SUBSCRIPTION_FIELDS).

  transient let STRIPE_API : Text = "https://api.stripe.com/v1/";
  // Pinned so `current_period_end` stays on the Subscription object.
  transient let STRIPE_VERSION : Text = "2024-06-20";
  transient let STRIPE_MAX_RESPONSE_BYTES : Nat64 = 64_000;

  public query func transformStripe({ context : Blob; response : IC.HttpRequestResult }) : async IC.HttpRequestResult {
    let keep = if (context == "session".encodeUtf8()) Billing.SESSION_FIELDS else Billing.SUBSCRIPTION_FIELDS;
    let body = switch (response.body.decodeUtf8()) { case (?t) Json.project(t, keep); case null "{}" };
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
        .withTransform({ function = transformStripe; context = kind.encodeUtf8() })
        .withExpectedRoundtripTimeMs(10_000)
        .withExpectedTransformInstructions(50_000_000)
        .send()
    } catch (_) { return #unavailable };
    if (resp.status == 404) return #notFound;
    if (resp.status != 200) return #unavailable;
    switch (resp.body.decodeUtf8()) { case (?t) #ok(t); case null #unavailable }
  };

  /// Grants Pro from a finished Stripe Checkout: the session must name the
  /// caller as its client_reference_id, be complete, and have started a
  /// subscription that is active or trialing.
  public shared ({ caller }) func claimWebSubscription(sessionId : Text) : async Result.Result<MyEntitlement, ClaimError> {
    if (caller.isAnonymous()) return #err(#notSignedIn);
    if (not Billing.validStripeId("cs_", sessionId)) return #err(#invalidSession);
    let key = switch stripeKey { case (?k) k; case null return #err(#notConfigured) };
    let sessionJson = switch (await stripeGet(key, "checkout/sessions/" # sessionId, "session")) {
      case (#ok(t)) t;
      case (#notFound) return #err(#invalidSession);
      case (#unavailable) return #err(#stripeUnavailable);
    };
    let subId = switch (Billing.claimCheck(sessionJson, caller.toText())) {
      case (#ok(id)) id;
      case (#err(e)) return #err(e);
    };
    switch (webSubscriptionOwner.get(Text.compare, subId)) {
      case (?owner) { if (owner != caller) return #err(#alreadyClaimed) };
      case null {};
    };
    let subJson = switch (await stripeGet(key, "subscriptions/" # subId, "subscription")) {
      case (#ok(t)) t;
      case (#notFound) return #err(#notSubscription);
      case (#unavailable) return #err(#stripeUnavailable);
    };
    switch (Billing.subscriptionState(subJson)) {
      case (?#renew(end)) {
        // Re-checked after the awaits: another claim may have landed meanwhile.
        switch (webSubscriptionOwner.get(Text.compare, subId)) {
          case (?owner) { if (owner != caller) return #err(#alreadyClaimed) };
          case null {};
        };
        webSubscriptionOwner.add(Text.compare, subId, caller);
        putEntitlement(caller, { tier = #pro; source = #web subId; expiresAt = end; updatedAt = Time.now() });
        let es = entitlementsOf(caller);
        #ok({ tier = if (Billing.isProAt(es, Time.now())) #pro else #free; paywallEnabled; entitlements = es })
      };
      case (?#pending or ?#ended) #err(#notActive);
      case null #err(#malformed);
    }
  };

  // Renewals: an hourly timer asks Stripe about web subscriptions near or
  // just past expiry (Billing.needsRenewalCheck), at most RENEWAL_BATCH per
  // run, extending those that renewed and letting the rest lapse at their
  // period end. Transient: after an upgrade the checks simply start over.
  transient let RENEWAL_BATCH : Nat = 20;
  transient let lastRenewalCheck : Map.Map<Text, Int> = Map.empty<Text, Int>();

  func renewDue() : async () {
    let key = switch stripeKey { case (?k) k; case null return };
    let now = Time.now();
    let due = List.empty<(Principal, Text)>();
    label scan for ((p, es) in entitlements.entries()) {
      for (e in es.values()) {
        switch (e.source) {
          case (#web subId) {
            if (Billing.needsRenewalCheck(e, lastRenewalCheck.get(Text.compare, subId), now)) {
              due.add((p, subId));
              if (due.size() >= RENEWAL_BATCH) break scan;
            };
          };
          case _ {};
        };
      };
    };
    for ((p, subId) in due.values()) {
      lastRenewalCheck.add(Text.compare, subId, Time.now());
      switch (await stripeGet(key, "subscriptions/" # subId, "subscription")) {
        case (#ok(json)) {
          switch (Billing.subscriptionState(json)) {
            case (?#renew(end)) {
              // Still theirs? (The account may have been deleted meanwhile.)
              if (webSubscriptionOwner.get(Text.compare, subId) == ?p) {
                putEntitlement(p, { tier = #pro; source = #web subId; expiresAt = end; updatedAt = Time.now() });
              };
            };
            case _ {};
          };
        };
        case _ {};
      };
    };
  };

  transient let _renewalTimer : Timer.TimerId = Timer.recurringTimer<system>(#seconds 3600, renewDue);

  func forgetEntitlements(p : Principal) {
    for (e in entitlementsOf(p).values()) {
      switch (e.source) { case (#web subId) webSubscriptionOwner.remove(Text.compare, subId); case _ {} };
    };
    entitlements.remove(Principal.compare, p);
  };

  func proBySource() : [(Text, Nat)] {
    let now = Time.now();
    var web = 0; var appStore = 0; var playStore = 0; var association = 0; var comp = 0;
    for (es in entitlements.values()) {
      for (e in es.values()) {
        if (e.expiresAt > now) switch (e.source) {
          case (#web _) web += 1;
          case (#appStore) appStore += 1;
          case (#playStore) playStore += 1;
          case (#association _) association += 1;
          case (#comp) comp += 1;
        };
      };
    };
    [("web", web), ("appStore", appStore), ("playStore", playStore), ("association", association), ("comp", comp)]
  };

  // ─── Account deletion ──────────────────────────────────────────────────────
  //
  // App Store guideline 5.1.1(v) and Google Play's account deletion policy:
  // an official can delete their account and its data from inside the app.
  // deleteAccount removes everything this canister holds at once, then a
  // timer asks every other canister to forget them (forgetUser), retrying
  // with backoff until each one has. Exam goes first, so a result it hasn't
  // pushed yet can't re-create stats in ranking after ranking has forgotten
  // them.

  let ERASE_TARGETS : [Text] = ["exam", "challenge", "mentorship", "association", "report", "ranking", "question", "content", "ai_proxy"];

  type Erasure = { pending : [Text]; attempts : Nat; nextTry : Int; requestedAt : Int };
  var erasures : Map.Map<Principal, Erasure> = Map.empty<Principal, Erasure>();
  var completedErasures : Nat = 0;

  public type DeletionStatus = { #NotRequested; #InProgress : { remaining : Nat }; };

  public shared ({ caller }) func deleteAccount() : async Result.Result<(), Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    Map.remove(profiles, Principal.compare, caller);
    Map.remove(studyPaces, Principal.compare, caller);
    Map.remove(progress, Principal.compare, caller);
    Map.remove(weeklyQuizHistory, Principal.compare, caller);
    Map.remove(monthlyQuizHistory, Principal.compare, caller);
    studyDays.remove(Principal.compare, caller);
    lastStudyBeat.remove(Principal.compare, caller);
    Map.remove(linkedAccounts, Principal.compare, caller);
    Map.remove(upcomingGames, Principal.compare, caller);
    Map.remove(pushSubscriptions, Principal.compare, caller);
    // This does not cancel a store or Stripe subscription: the app tells the
    // official to cancel it first.
    forgetEntitlements(caller);
    if (Map.get(erasures, Principal.compare, caller) == null) {
      Map.add(erasures, Principal.compare, caller, { pending = ERASE_TARGETS; attempts = 0; nextTry = 0; requestedAt = Time.now() });
    };
    armErase<system>(Time.now());
    #ok(())
  };

  public shared query ({ caller }) func getDeletionStatus() : async DeletionStatus {
    switch (Map.get(erasures, Principal.compare, caller)) {
      case (?e) #InProgress({ remaining = e.pending.size() });
      case null #NotRequested;
    }
  };

  type Forgetful = actor { forgetUser : shared Principal -> async Result.Result<(), Text> };

  transient var eraseTimer : ?(Timer.TimerId, Int) = null;

  func armErase<system>(at : Int) {
    let now = Time.now();
    switch eraseTimer {
      case (?(_, fires)) { if (fires <= at) return };
      case null {};
    };
    switch eraseTimer { case (?(id, _)) Timer.cancelTimer(id); case null {} };
    let delayNs = Int.abs(Int.max(at - now, 0));
    let id = Timer.setTimer<system>(#nanoseconds delayNs, func() : async () { await flushErasures() });
    eraseTimer := ?(id, now + delayNs);
  };

  // Timers don't survive an upgrade; pick the queue up again.
  system func postupgrade() {
    if (not Map.isEmpty(erasures)) armErase<system>(Time.now());
  };

  func flushErasures() : async () {
    eraseTimer := null;
    let now = Time.now();
    let due = List.empty<Principal>();
    for ((p, e) in Map.entries(erasures)) { if (e.nextTry <= now) List.add(due, p) };
    for (p in List.values(due)) { await* erase(p) };
    var next : ?Int = null;
    for ((_, e) in Map.entries(erasures)) {
      next := ?(switch next { case (?n) Int.min(n, e.nextTry); case null e.nextTry });
    };
    switch next {
      case (?at) armErase<system>(Int.max(at, Time.now() + 60_000_000_000));
      case null {};
    };
  };

  // Works through one official's remaining canisters in order, stopping at
  // the first that fails so the order holds on the retry.
  func erase<system>(p : Principal) : async* () {
    let e = switch (Map.get(erasures, Principal.compare, p)) { case (?e) e; case null return };
    var remaining = e.pending;
    label targets for (name in e.pending.values()) {
      switch (Env.canisterId<system>(name)) {
        // Not deployed alongside this one (e.g. a partial local deploy):
        // nothing there to forget.
        case null {};
        case (?cid) {
          let ok = try {
            switch (await (actor (Principal.toText(cid)) : Forgetful).forgetUser(p)) { case (#ok) true; case (#err(_)) false }
          } catch (_ : Error.Error) false;
          if (not ok) break targets;
        };
      };
      remaining := Array.sliceToArray<Text>(remaining, 1, remaining.size());
    };
    if (remaining.size() == 0) {
      Map.remove(erasures, Principal.compare, p);
      completedErasures += 1;
    } else {
      // 1, 2, 4 ... minutes, then hourly, until it goes through. Never
      // dropped: the official was told their data would be deleted.
      let backoff = 60_000_000_000 * Nat.pow(2, Nat.min(e.attempts, 6));
      Map.add(erasures, Principal.compare, p, { e with pending = remaining; attempts = e.attempts + 1; nextTry = Time.now() + backoff });
    };
  };

  // ─── App error log ─────────────────────────────────────────────────────────
  //
  // The app reports crashes and failed loads here (src/lib/errorReporting.ts)
  // so they're visible without a third-party crash service, and so no extra
  // party sees users' data. Nothing identifies the official: the caller isn't
  // stored, and the app strips principals from messages before sending. The
  // log keeps the latest MAX_CLIENT_ERRORS entries; admins read it on the
  // app's moderation page.

  public type ClientErrorInput = {
    kind     : Text; // "crash" | "unhandled" | "load"
    message  : Text;
    stack    : Text;
    route    : Text;
    release  : Text;
    platform : Text; // "web" | "android" | "ios"
  };

  public type ClientError = {
    seq      : Nat;
    at       : Int;
    kind     : Text;
    message  : Text;
    stack    : Text;
    route    : Text;
    release  : Text;
    platform : Text;
    signedIn : Bool;
  };

  let MAX_CLIENT_ERRORS : Nat = 500;
  var clientErrors : Map.Map<Nat, ClientError> = Map.empty<Nat, ClientError>();
  var nextClientErrorSeq : Nat = 0;

  func clip(t : Text, n : Nat) : Text {
    if (Text.size(t) <= n) return t;
    var out = "";
    var i = 0;
    label take for (c in t.chars()) {
      if (i >= n) break take;
      out #= Text.fromChar(c);
      i += 1;
    };
    out
  };

  public shared ({ caller }) func logClientError(e : ClientErrorInput) : async () {
    let seq = nextClientErrorSeq;
    nextClientErrorSeq += 1;
    Map.add(clientErrors, Nat.compare, seq, {
      seq; at = Time.now();
      kind = clip(e.kind, 16); message = clip(e.message, 500); stack = clip(e.stack, 2_000);
      route = clip(e.route, 200); release = clip(e.release, 40); platform = clip(e.platform, 16);
      signedIn = not Principal.isAnonymous(caller);
    });
    if (seq >= MAX_CLIENT_ERRORS) Map.remove(clientErrors, Nat.compare, seq - MAX_CLIENT_ERRORS);
  };

  /// Newest first, at most `limit`.
  public shared query ({ caller }) func listClientErrors(limit : Nat) : async Result.Result<[ClientError], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let out = List.empty<ClientError>();
    label newest for ((_, e) in Map.reverseEntries(clientErrors)) {
      if (List.size(out) >= limit) break newest;
      List.add(out, e);
    };
    #ok(List.toArray(out))
  };

  public shared query ({ caller }) func isAdminCaller() : async Bool { isAdmin(caller) };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyProfile() : async ?Profile {
    viewOpt(Map.get(profiles, Principal.compare, caller))
  };

  // Full profiles (role, state, language, sign-up date) are private to their
  // owner and admins. Other users get the public subset below, which is what
  // the app shows about someone else (challenger names, rosters, friends).
  public shared query ({ caller }) func getProfile(p : Principal) : async ?Profile {
    if (caller != p and not isAdmin(caller)) return null;
    viewOpt(Map.get(profiles, Principal.compare, p))
  };

  public type PublicProfile = {
    principal   : Principal;
    displayName : Text;
    sport       : Text;
    level       : Text;
    state       : Text; // already public through the state leaderboards
  };

  public query func getPublicProfile(p : Principal) : async ?PublicProfile {
    switch (Map.get(profiles, Principal.compare, p)) {
      case (?pr) ?{ principal = pr.principal; displayName = pr.displayName; sport = pr.sport; level = pr.level; state = pr.state };
      case null null;
    }
  };

  public shared query ({ caller }) func getMyStudyPace() : async ?StudyPace {
    Map.get(studyPaces, Principal.compare, caller)
  };

  public shared query ({ caller }) func getMyProgress() : async [ArticleProgress] {
    switch (Map.get(progress, Principal.compare, caller)) { case (?p) p; case null [] }
  };

  public shared query ({ caller }) func getWeeklyQuizHistory() : async [WeeklyQuizResult] {
    switch (Map.get(weeklyQuizHistory, Principal.compare, caller)) { case (?h) h; case null [] }
  };

  public shared query ({ caller }) func getMonthlyQuizHistory() : async [MonthlyQuizResult] {
    switch (Map.get(monthlyQuizHistory, Principal.compare, caller)) { case (?h) h; case null [] }
  };

  public shared query ({ caller }) func getMyPushSubscription() : async ?PushSubscription {
    Map.get(pushSubscriptions, Principal.compare, caller)
  };

  // Admin-only (unlike getProfile(p)/getStats(p) elsewhere) — a push
  // endpoint is sensitive delivery infrastructure, not public profile data.
  // Used by scripts/send-pending-push.mjs to resolve who to actually push to.
  public shared query ({ caller }) func getSubscriptionFor(p : Principal) : async Result.Result<?PushSubscription, Text> {
    if (not isAdmin(caller) and not isPushRelay(caller)) return #err("Admin only");
    #ok(Map.get(pushSubscriptions, Principal.compare, p))
  };

  public shared query ({ caller }) func getMyLinkedAccounts() : async [LinkedAccount] {
    switch (Map.get(linkedAccounts, Principal.compare, caller)) { case (?a) a; case null [] }
  };

  // Past games age out on their own here rather than needing a cleanup job:
  // only games at or after "now" are ever returned.
  public shared query ({ caller }) func getMyUpcomingGames() : async [UpcomingGame] {
    let all = switch (Map.get(upcomingGames, Principal.compare, caller)) { case (?g) g; case null [] };
    let now = Time.now();
    let future = Array.filter<UpcomingGame>(all, func(g) { g.gameDate >= now });
    Array.sort<UpcomingGame>(future, func(a, b) { Int.compare(a.gameDate, b.gameDate) })
  };

  // Caller supplies the full, stably-ordered list of article ids (from the
  // content canister) since this canister doesn't own article data itself.
  public shared query ({ caller }) func getWeeklySchedule(allArticleIds : [Text]) : async WeeklySchedule {
    let total = allArticleIds.size();
    if (total == 0) return { dueThisWeek = []; overdue = []; weekNumber = 0 };

    let pace = switch (Map.get(studyPaces, Principal.compare, caller)) {
      case (?p) p;
      case null { return { dueThisWeek = []; overdue = []; weekNumber = 0 } };
    };
    let myProgress = switch (Map.get(progress, Principal.compare, caller)) { case (?p) p; case null [] };
    let now = Time.now();

    let weeksElapsed : Nat = if (now <= pace.startDate) 0 else Int.abs(now - pace.startDate) / WEEK_NS;
    let totalWeeksInCycle : Nat = (total + pace.articlesPerWeek - 1) / pace.articlesPerWeek;
    let cycleNumber : Nat = weeksElapsed / totalWeeksInCycle;
    let currentWeekInCycle : Nat = weeksElapsed % totalWeeksInCycle;

    func lastStudiedOf(articleId : Text) : ?Int {
      switch (Array.find<ArticleProgress>(myProgress, func(p) { p.articleId == articleId })) {
        case (?p) ?p.lastStudied;
        case null null;
      }
    };

    var due : [Text] = [];
    var overdue : [Text] = [];
    var i = 0;
    while (i < total) {
      let assignedWeek = i / pace.articlesPerWeek;
      // Advance dueAt by full cycles so an article becomes "due" again each
      // time its slot recurs, rather than counting as permanently covered
      // after the first annual cycle.
      let dueAt = pace.startDate + (cycleNumber * totalWeeksInCycle + assignedWeek) * WEEK_NS;
      if (now >= dueAt and assignedWeek <= currentWeekInCycle) {
        let studiedSince = switch (lastStudiedOf(allArticleIds[i])) {
          case (?t) t >= dueAt;
          case null false;
        };
        if (not studiedSince) {
          if (assignedWeek == currentWeekInCycle) {
            due := Array.concat<Text>(due, [allArticleIds[i]]);
          } else {
            overdue := Array.concat<Text>(overdue, [allArticleIds[i]]);
          };
        };
      };
      i += 1;
    };

    { dueThisWeek = due; overdue = overdue; weekNumber = currentWeekInCycle + 1 }
  };

  public query func metrics() : async { userCount : Nat; pendingDeletions : Nat; completedDeletions : Nat; clientErrors : Nat; proBySource : [(Text, Nat)]; paywallEnabled : Bool } {
    { userCount = profiles.size(); pendingDeletions = erasures.size(); completedDeletions = completedErasures; clientErrors = nextClientErrorSeq; proBySource = proBySource(); paywallEnabled }
  };
}
