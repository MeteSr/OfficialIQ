/// How the ranking canister stores an official's stats, separate from the
/// UserStats type its API returns (see backend/exam/Stored.mo for why and
/// how to add a version). main.mo converts in view().
module {

  public type StatsV1 = {
    principal     : Principal;
    displayName   : Text;
    sport         : Text;
    state         : Text;
    elo           : Float;
    streak        : Nat;
    bestStreak    : Nat;
    accuracy      : Float;
    avgElapsedSec : Float;
    examCount     : Nat;
    updatedAt     : Int;
  };

  /// The current stored version.
  public type Stats = StatsV1;
}
