import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

persistent actor Question {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Difficulty = { #Beginner; #Intermediate; #Advanced; #Expert };

  public type Choice = { id : Text; text : Text };

  public type Question = {
    id          : Text;
    sportId     : Text;
    articleId   : Text;
    citation    : Text;
    stem        : Text;
    choices     : [Choice];
    correctId   : Text;
    explanation : Text;
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
    articleIds : [Text];
    casebook   : Bool;
    difficulty : ?Difficulty;
    count      : Nat;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var questions : Map.Map<Text, Question> = Map.empty<Text, Question>();

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
    Map.add(questions, Text.compare, id, q);
    #ok(q)
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getQuestion(id : Text) : async ?Question {
    Map.get(questions, Text.compare, id)
  };

  public query func sampleQuiz(filter : QuizFilter) : async [Question] {
    let buf = VarArray.repeat<Question>({
      id = ""; sportId = ""; articleId = ""; citation = ""; stem = "";
      choices = []; correctId = ""; explanation = "";
      difficulty = #Beginner; isCasebook = false; createdAt = 0;
    }, Map.size(questions));
    var i = 0;
    for ((_, q) in Map.entries(questions)) {
      if (q.sportId == filter.sportId and q.isCasebook == filter.casebook) {
        let articleMatch : Bool =
          filter.articleIds.size() == 0 or
          Array.find<Text>(filter.articleIds, func(a) { a == q.articleId }) != null;
        let diffMatch : Bool = switch (filter.difficulty) {
          case null true;
          case (?d) switch (q.difficulty, d) {
            case (#Beginner,     #Beginner)     true;
            case (#Intermediate, #Intermediate) true;
            case (#Advanced,     #Advanced)     true;
            case (#Expert,       #Expert)       true;
            case _                              false;
          };
        };
        if (articleMatch and diffMatch and i < filter.count) {
          buf[i] := q;
          i += 1;
        };
      };
    };
    VarArray.sliceToArray<Question>(buf, 0, i)
  };

  public query func metrics() : async { questionCount : Nat } {
    { questionCount = Map.size(questions) }
  };
}
