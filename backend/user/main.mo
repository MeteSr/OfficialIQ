import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Array "mo:core/Array";
import Iter "mo:core/Iter";

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

  var profiles           : Map.Map<Principal, Profile> = Map.empty<Principal, Profile>();
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
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Map.get(profiles, Principal.compare, caller) != null) return #err("Profile already exists");

    let p : Profile = {
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
    #ok(p)
  };

  public shared ({ caller }) func updateProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    switch (Map.get(profiles, Principal.compare, caller)) {
      case null { #err("Profile not found") };
      case (?existing) {
        let updated : Profile = {
          principal         = existing.principal;
          displayName       = req.displayName;
          role              = existing.role;
          sport             = req.sport;
          level             = req.level;
          state             = req.state;
          preferredLanguage = if (req.preferredLanguage == "") "en" else req.preferredLanguage;
          createdAt         = existing.createdAt;
        };
        Map.add(profiles, Principal.compare, caller, updated);
        #ok(updated)
      };
    }
  };

  // Self-service elevation, mirroring the low-friction model already used for
  // creating study groups/associations elsewhere — anyone who sets up an
  // association becomes its coordinator.
  public shared ({ caller }) func becomeCoordinator() : async Result.Result<Profile, Text> {
    switch (Map.get(profiles, Principal.compare, caller)) {
      case null #err("Profile not found");
      case (?existing) {
        let updated : Profile = { existing with role = #Coordinator };
        Map.add(profiles, Principal.compare, caller, updated);
        #ok(updated)
      };
    }
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

  public shared ({ caller }) func recordWeeklyQuizResult(weekNumber : Nat, newScore : Nat, retentionScore : Nat) : async () {
    let existing = switch (Map.get(weeklyQuizHistory, Principal.compare, caller)) { case (?h) h; case null [] };
    let entry : WeeklyQuizResult = { weekNumber; newScore; retentionScore; completedAt = Time.now() };
    Map.add(weeklyQuizHistory, Principal.compare, caller, Array.concat<WeeklyQuizResult>(existing, [entry]));
  };

  public shared ({ caller }) func recordMonthlyQuizResult(month : Nat, score : Nat, articleScores : [(Text, Nat)]) : async () {
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

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyProfile() : async ?Profile {
    Map.get(profiles, Principal.compare, caller)
  };

  public query func getProfile(p : Principal) : async ?Profile {
    Map.get(profiles, Principal.compare, p)
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
    if (not isAdmin(caller)) return #err("Admin only");
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

  public query func metrics() : async { userCount : Nat } {
    { userCount = Map.size(profiles) }
  };
}
