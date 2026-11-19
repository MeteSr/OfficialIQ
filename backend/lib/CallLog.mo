/// Post-game call log rules (issue #66), shared by the user canister (the
/// log) and the question canister (the review boost). Pure functions,
/// unit-tested in test/CallLog.test.mo.
import Int "mo:core/Int";
import Text "mo:core/Text";

module {

  public let MAX_NOTE_CHARS : Nat = 1_000;
  /// Calls kept per official.
  public let MAX_CALLS : Nat = 300;
  /// How long after a game its calls can be logged.
  public let LOG_WINDOW_DAYS : Nat = 30;
  /// How long a queued call keeps its rule at the front of the adaptive
  /// picker if it's never marked reviewed.
  public let BOOST_DAYS : Nat = 30;

  let DAY_NS : Int = 86_400_000_000_000;

  public type NoteInvalid = { #empty; #tooLong };
  public type GameNotLoggable = { #notYet; #tooOld };

  public func validateNote(note : Text) : ?NoteInvalid {
    if (note.trim(#char ' ').size() == 0) return ?#empty;
    if (note.size() > MAX_NOTE_CHARS) return ?#tooLong;
    null
  };

  /// Calls can be logged once a game has started, for LOG_WINDOW_DAYS.
  public func canLog(gameDate : Int, now : Int) : ?GameNotLoggable {
    if (gameDate > now) return ?#notYet;
    if (gameDate < now - LOG_WINDOW_DAYS * DAY_NS) return ?#tooOld;
    null
  };

  /// The due date the adaptive picker uses for a question: while its
  /// article is boosted (`boostedUntil` in the future), it's treated as a
  /// month overdue, ahead of unanswered questions (due now) and anything
  /// scheduled. An already more overdue date is kept.
  public func boostedDue(nextDue : Int, boostedUntil : ?Int, now : Int) : Int {
    switch boostedUntil {
      case (?until) { if (until > now) Int.min(nextDue, now - 30 * DAY_NS) else nextDue };
      case null nextDue;
    }
  };
}
