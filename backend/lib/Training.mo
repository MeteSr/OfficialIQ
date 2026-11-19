/// Training-time rules for the transcript (issue #67), shared by the exam,
/// user and association canisters. Pure functions over plain values, so the
/// rules are unit-tested (test/Training.test.mo) apart from the actors.
import Array "mo:core/Array";
import Int "mo:core/Int";
import Nat "mo:core/Nat";

module {

  let SEC : Int = 1_000_000_000;
  let DAY_NS : Int = 86_400_000_000_000;

  /// A study heartbeat counts the time since the previous one only if that
  /// was at most this long ago, so an idle or closed app stops earning time.
  public let STUDY_GAP_NS : Int = 120_000_000_000; // 2 minutes
  public let MAX_STUDY_SEC_PER_DAY : Nat = 14_400; // 4 hours
  /// Study days kept: the exam canister's 12 months plus a margin.
  public let STUDY_KEEP_DAYS : Nat = 400;
  public let MAX_HOURS_PER_SEASON : Nat = 2000;

  /// Study time credited on one UTC day (whole days since 1970-01-01).
  public type StudyDay = { day : Nat; seconds : Nat };

  /// An association's requirement: hours per season, where a season is the
  /// twelve months from the 1st of seasonStartMonth (1-12).
  public type RequirementInput = { hoursPerSeason : Nat; seasonStartMonth : Nat };

  public type RequirementInvalid = { #invalidHours; #invalidSeasonStartMonth };

  /// Time credited for a graded session: its answer times (each already
  /// capped at the question's time limit), never more than the wall-clock
  /// time between starting and finishing it.
  public func creditedSec(answerSecs : [Nat], startedAt : Int, finishedAt : Int) : Nat {
    var answerSec = 0;
    for (s in answerSecs.values()) answerSec += s;
    let wall = finishedAt - startedAt;
    if (wall <= 0) return 0;
    Nat.min(answerSec, (wall / SEC).toNat())
  };

  /// Seconds a heartbeat at `now` credits, given the previous one.
  public func beatCredit(last : ?Int, now : Int) : Nat {
    switch last {
      case null 0;
      case (?l) {
        let gap = now - l;
        if (gap <= 0 or gap > STUDY_GAP_NS) 0 else (gap / SEC).toNat()
      };
    }
  };

  /// `days` with `sec` more seconds on the day of `now`, capped per day, and
  /// days past the retention window dropped. Days stay in ascending order.
  public func addStudy(days : [StudyDay], now : Int, sec : Nat) : [StudyDay] {
    if (sec == 0) return days;
    let today = (now / DAY_NS).toNat();
    let oldest : Nat = if (today > STUDY_KEEP_DAYS) today - STUDY_KEEP_DAYS else 0;
    let kept = days.filter(func d = d.day >= oldest);
    let n = kept.size();
    if (n > 0 and kept[n - 1].day == today) {
      let total = Nat.min(MAX_STUDY_SEC_PER_DAY, kept[n - 1].seconds + sec);
      Array.tabulate<StudyDay>(n, func i = if (i + 1 < n) kept[i] else ({ day = today; seconds = total }))
    } else kept.concat([{ day = today; seconds = Nat.min(MAX_STUDY_SEC_PER_DAY, sec) }])
  };

  /// Why a requirement is invalid, or null when it is valid.
  public func validateRequirement(r : RequirementInput) : ?RequirementInvalid {
    if (r.seasonStartMonth < 1 or r.seasonStartMonth > 12) return ?#invalidSeasonStartMonth;
    if (r.hoursPerSeason == 0 or r.hoursPerSeason > MAX_HOURS_PER_SEASON) return ?#invalidHours;
    null
  };
}
