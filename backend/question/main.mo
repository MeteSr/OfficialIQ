import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

persistent actor Question {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Difficulty = { #Beginner; #Intermediate; #Advanced; #Expert };

  public type Choice = { id : Text; text : Text };

  public type Question = {
    id          : Text;
    sportId     : Text;
    articleId   : Text;   // e.g. "ncaa_basketball:art4"
    citation    : Text;   // "Art. 4-23, pg. 42"
    stem        : Text;   // question text
    choices     : [Choice];
    correctId   : Text;   // id of the correct Choice
    explanation : Text;   // shown after answer
    difficulty  : Difficulty;
    isCasebook  : Bool;
    createdAt   : Int;
  };

  public type QuestionInput = {
    sportId     : Text;
    articleId   : Text;
    citation    : Text;
    stem        : Text;
    choices     : [Choice];
    correctId   : Text;
    explanation : Text;
    difficulty  : Difficulty;
    isCasebook  : Bool;
  };

  public type QuizFilter = {
    sportId    : Text;
    articleIds : [Text];   // empty = all articles
    casebook   : Bool;
    difficulty : ?Difficulty;
    count      : Nat;      // desired question count (1-100)
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var questions : HashMap.HashMap<Text, Question> =
    HashMap.HashMap<Text, Question>(1024, Text.equal, Text.hash);

  var nextId : Nat = 0;
  var adminPrincipal : ?Principal = null;

  // ─── Admin ────────────────────────────────────────────────────────────────

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  public shared ({ caller }) func addQuestion(input : QuestionInput) : async Result.Result<Question, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let id = "q" # Nat.toText(nextId);
    nextId += 1;
    let q : Question = {
      id          = id;
      sportId     = input.sportId;
      articleId   = input.articleId;
      citation    = input.citation;
      stem        = input.stem;
      choices     = input.choices;
      correctId   = input.correctId;
      explanation = input.explanation;
      difficulty  = input.difficulty;
      isCasebook  = input.isCasebook;
      createdAt   = Time.now();
    };
    questions.put(id, q);
    #ok(q)
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getQuestion(id : Text) : async ?Question {
    questions.get(id)
  };

  public query func sampleQuiz(filter : QuizFilter) : async [Question] {
    var pool : [Question] = [];
    for ((_, q) in questions.entries()) {
      if (q.sportId == filter.sportId and q.isCasebook == filter.casebook) {
        let articleMatch = filter.articleIds.size() == 0 or
          Array.find<Text>(filter.articleIds, func(a) { a == q.articleId }) != null;
        let diffMatch = switch filter.difficulty {
          case null true;
          case (?d) { switch (q.difficulty, d) {
            case (#Beginner, #Beginner) true;
            case (#Intermediate, #Intermediate) true;
            case (#Advanced, #Advanced) true;
            case (#Expert, #Expert) true;
            case _ false;
          }};
        };
        if (articleMatch and diffMatch) {
          pool := Array.append(pool, [q]);
        };
      };
    };
    // Return up to `count` questions (no shuffle on-chain; client shuffles)
    let cap = if (filter.count < pool.size()) filter.count else pool.size();
    Array.tabulate<Question>(cap, func(i) { pool[i] })
  };

  public query func metrics() : async { questionCount : Nat } {
    { questionCount = questions.size() }
  };
}
