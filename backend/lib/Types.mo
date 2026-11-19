/// Types that cross canister boundaries. Each canister that sends or reads
/// one of these imports it from here, so the sender and every reader agree
/// on its shape: adding an ExamMode variant, say, changes it everywhere at
/// once instead of leaving ranking, challenge and association unable to
/// decode exam's gradedResult.
///
/// Candid is structural, so moving a type here changes neither the
/// canisters' interfaces nor their stable memory.
module {

  public type ExamMode = { #Solo; #ShareLink; #Timed; #Certification };

  public type Difficulty = { #Beginner; #Intermediate; #Advanced; #Expert };

  public type Choice = { id : Text; text : Text };

  /// A question with its answer, as the question canister stores it and
  /// hands it to the exam canister (pickForExam, questionsForExam).
  public type Question = {
    id                : Text;
    sportId           : Text;
    articleId         : Text;
    citation          : Text;
    stem              : Text;
    choices           : [Choice];
    correctId         : Text;
    explanation       : Text;
    difficulty        : Difficulty;
    isCasebook        : Bool;
    isPointOfEmphasis : Bool;
    createdAt         : Int;
  };

  /// One slice of an exam the question canister picks for the exam canister.
  public type ExamPick = {
    articleIds : [Text];
    casebook   : Bool;
    count      : Nat;
    difficulty : ?Difficulty;
    adaptive   : Bool; // most-overdue first for the player (as getAdaptiveQuiz)
    /// Only questions carrying this tag (question.setQuestionTags), e.g.
    /// "rule-change:2026-27" for the season's rule-changes quiz (#68).
    /// Optional, so older clients' picks still decode.
    tag        : ?Text;
  };

  /// The server-computed result of a finished, graded exam session, as the
  /// exam canister returns it to the session's owner and to the ranking,
  /// challenge and association canisters. score counts unanswered questions
  /// as wrong.
  public type GradedResult = {
    id            : Text;
    owner         : Principal;
    mode          : ExamMode;
    sportId       : Text;
    articleIds    : [Text];
    questionIds   : [Text];
    questionCount : Nat;
    answered      : Nat;
    correct       : Nat;
    score         : Nat;
    avgElapsedSec : Nat;
    finishedAt    : Int;
  };

  /// One answer of a finished session, as exam pushes it to ranking for the
  /// rating (weighted by difficulty) and the skill counters (speed streak,
  /// casebook accuracy). difficulty is optional so older exam builds still
  /// decode.
  public type AnswerSignal = { isCorrect : Bool; elapsedSec : Nat; isCasebook : Bool; difficulty : ?Difficulty };

  /// The part of the exam canister that ranking, challenge and association
  /// call.
  public type ExamResults = actor {
    gradedResult : shared query Text -> async ?GradedResult;
  };

  /// ExamResults plus the missed question ids of a finished session.
  public type ExamMisses = actor {
    gradedResult : shared query Text -> async ?GradedResult;
    gradedMisses : shared query Text -> async ?[Text];
  };
}
