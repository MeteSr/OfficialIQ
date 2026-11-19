/// How the exam canister stores a session, separate from the ExamSession
/// type its API returns (finding 7 of the Nov 2026 engineering review).
///
/// A stored type is part of the canister's stable memory: changing it needs
/// a compatible upgrade or a migration, while the API type can change with
/// only a Candid check. Keeping them apart means an API change no longer
/// silently becomes a stable-memory change. Today the two have the same
/// fields; main.mo converts between them in view() and fromConfig(), which is
/// where a difference gets handled.
///
/// To change what is stored: add SessionV2 here, point `Session` at it, and
/// fill the new stable var from the old one in its initializer (as
/// questionMetaV2 and lib/Index.mo do), leaving the V1 var empty.
module {

  public type ModeV1 = { #Solo; #ShareLink; #Timed; #Certification };

  public type ConfigV1 = {
    sportId    : Text;
    articleIds : [Text];
    casebook   : Bool;
    count      : Nat;
    secPerQ    : Nat;
    mode       : ModeV1;
  };

  public type AnswerV1 = {
    questionId : Text;
    chosenId   : Text;
    isCorrect  : Bool;
    elapsedSec : Nat;
  };

  public type SessionV1 = {
    id            : Text;
    owner         : Principal;
    config        : ConfigV1;
    questionIds   : [Text];
    answers       : [AnswerV1];
    score         : ?Nat;
    avgElapsedSec : ?Nat;
    shareToken    : ?Text;
    startedAt     : Int;
    finishedAt    : ?Int;
  };

  /// The current stored version.
  public type Session = SessionV1;
  public type Config = ConfigV1;
  public type Answer = AnswerV1;
}
