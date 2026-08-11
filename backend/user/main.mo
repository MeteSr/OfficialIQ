import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
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
  };

  public type Profile = {
    principal   : Principal;
    displayName : Text;
    role        : Role;
    sport       : Text;
    level       : Text;
    state       : Text;
    createdAt   : Int;
  };

  public type ProfileUpdate = {
    displayName : Text;
    sport       : Text;
    level       : Text;
    state       : Text;
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

  // ─── State ────────────────────────────────────────────────────────────────

  var profiles           : Map.Map<Principal, Profile> = Map.empty<Principal, Profile>();
  var studyPaces          : Map.Map<Principal, StudyPace> = Map.empty<Principal, StudyPace>();
  var progress            : Map.Map<Principal, [ArticleProgress]> = Map.empty<Principal, [ArticleProgress]>();
  var weeklyQuizHistory   : Map.Map<Principal, [WeeklyQuizResult]> = Map.empty<Principal, [WeeklyQuizResult]>();
  var monthlyQuizHistory  : Map.Map<Principal, [MonthlyQuizResult]> = Map.empty<Principal, [MonthlyQuizResult]>();

  let WEEK_NS : Nat = 7 * 24 * 3600 * 1_000_000_000;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Map.get(profiles, Principal.compare, caller) != null) return #err("Profile already exists");

    let p : Profile = {
      principal   = caller;
      displayName = req.displayName;
      role        = #Official;
      sport       = req.sport;
      level       = req.level;
      state       = req.state;
      createdAt   = Time.now();
    };
    Map.add(profiles, Principal.compare, caller, p);
    #ok(p)
  };

  public shared ({ caller }) func updateProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    switch (Map.get(profiles, Principal.compare, caller)) {
      case null { #err("Profile not found") };
      case (?existing) {
        let updated : Profile = {
          principal   = existing.principal;
          displayName = req.displayName;
          role        = existing.role;
          sport       = req.sport;
          level       = req.level;
          state       = req.state;
          createdAt   = existing.createdAt;
        };
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
