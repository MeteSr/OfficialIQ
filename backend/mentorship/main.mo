import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Token "../lib/Token";
import Index "../lib/Index";
import Env "../lib/Env";

persistent actor Mentorship {

  // ─── Types ────────────────────────────────────────────────────────────────

  // A denormalized snapshot of one exam answer, captured at share time so the
  // mentor's view doesn't need a live cross-canister call back into `exam`.
  public type AnswerSnapshot = {
    questionId : Text;
    chosenId   : Text;
    correctId  : Text;
    isCorrect  : Bool;
    elapsedSec : Nat;
  };

  // `mentorPrincipal` starts null and is bound to whichever principal first
  // opens the link (see openMentorLink) — the official shares an opaque
  // token, not a principal, since they typically don't know their mentor's
  // principal id ahead of time.
  public type MentorLink = {
    id              : Text;
    token           : Text;
    owner           : Principal;
    mentorPrincipal : ?Principal;
    examId          : Text;
    sportId         : Text;
    score           : Nat;
    avgElapsedSec   : ?Nat;
    answers         : [AnswerSnapshot];
    revoked         : Bool;
    createdAt       : Int;
    expiresAt       : Int;
  };

  public type Annotation = {
    id         : Text;
    linkId     : Text;
    questionId : Text;
    mentor     : Principal;
    note       : Text;
    seen       : Bool;
    createdAt  : Int;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var links       : Map.Map<Text, MentorLink> = Map.empty<Text, MentorLink>();
  var tokenIndex  : Map.Map<Text, Text>       = Map.empty<Text, Text>(); // token -> link id
  var annotations : Map.Map<Text, Annotation> = Map.empty<Text, Annotation>();

  // Secondary indexes (lib/Index.mo), built from the tables above on the
  // upgrade that adds them.
  var linksByOwner : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((id, l) in Map.entries(links)) Index.add(ix, Principal.compare, l.owner, id);
    ix
  };
  var linksByMentor : Index.Index<Principal> = do {
    let ix = Index.empty<Principal>();
    for ((id, l) in Map.entries(links)) {
      switch (l.mentorPrincipal) { case (?m) Index.add(ix, Principal.compare, m, id); case null {} };
    };
    ix
  };
  var annotationsByLink : Index.Index<Text> = do {
    let ix = Index.empty<Text>();
    for ((id, a) in Map.entries(annotations)) Index.add(ix, Text.compare, a.linkId, id);
    ix
  };

  var nextLinkId       : Nat = 0;
  var nextAnnotationId : Nat = 0;

  let TTL_NS : Int = 30 * 24 * 3600 * 1_000_000_000;
  let MAX_ANSWERS : Nat = 200;
  let MAX_NOTE_CHARS : Nat = 2_000;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createMentorLink(
    examId        : Text,
    sportId       : Text,
    score         : Nat,
    avgElapsedSec : ?Nat,
    answers       : [AnswerSnapshot],
  ) : async Result.Result<MentorLink, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (answers.size() > MAX_ANSWERS) return #err("Too many answers");
    // Whoever opens the link first becomes its mentor (openMentorLink), so
    // the token must be unguessable, not derived from the link counter.
    let token = await Token.hex("tok");
    let id    = "mtl" # Nat.toText(nextLinkId);
    nextLinkId += 1;
    let now = Time.now();
    let link : MentorLink = {
      id; token; owner = caller; mentorPrincipal = null;
      examId; sportId; score; avgElapsedSec; answers;
      revoked = false; createdAt = now; expiresAt = now + TTL_NS;
    };
    Map.add(links, Text.compare, id, link);
    Map.add(tokenIndex, Text.compare, token, id);
    Index.add(linksByOwner, Principal.compare, caller, id);
    #ok(link)
  };

  public shared ({ caller }) func revokeMentorLink(id : Text) : async Result.Result<(), Text> {
    switch (Map.get(links, Text.compare, id)) {
      case null #err("Link not found");
      case (?l) {
        if (l.owner != caller) return #err("Not your link");
        Map.add(links, Text.compare, id, { l with revoked = true });
        #ok(())
      };
    }
  };

  // Opens (and, on first visit, claims) a shared link by its opaque token.
  // The owner can always preview their own report; anyone else is only
  // admitted if they are the mentor already bound to this link, or if no
  // mentor has claimed it yet (in which case they become the mentor).
  public shared ({ caller }) func openMentorLink(token : Text) : async Result.Result<MentorLink, Text> {
    switch (Map.get(tokenIndex, Text.compare, token)) {
      case null #err("Link not found");
      case (?id) {
        switch (Map.get(links, Text.compare, id)) {
          case null #err("Link not found");
          case (?l) {
            if (l.revoked) return #err("This link has been revoked");
            if (Time.now() > l.expiresAt) return #err("This link has expired");
            if (l.owner == caller) return #ok(l);
            switch (l.mentorPrincipal) {
              case null {
                let claimed = { l with mentorPrincipal = ?caller };
                Map.add(links, Text.compare, id, claimed);
                Index.add(linksByMentor, Principal.compare, caller, id);
                #ok(claimed)
              };
              case (?m) {
                if (m == caller) #ok(l)
                else #err("This link is bound to a different mentor")
              };
            }
          };
        }
      };
    }
  };

  public shared ({ caller }) func addAnnotation(linkId : Text, questionId : Text, note : Text) : async Result.Result<Annotation, Text> {
    switch (Map.get(links, Text.compare, linkId)) {
      case null #err("Link not found");
      case (?l) {
        switch (l.mentorPrincipal) {
          case null #err("No mentor has claimed this link yet");
          case (?m) {
            if (m != caller) return #err("Not the mentor for this link");
            if (l.revoked) return #err("This link has been revoked");
            if (Time.now() > l.expiresAt) return #err("This link has expired");
            if (Text.size(note) > MAX_NOTE_CHARS) return #err("Note is too long");
            let id = "an" # Nat.toText(nextAnnotationId);
            nextAnnotationId += 1;
            let a : Annotation = { id; linkId; questionId; mentor = caller; note; seen = false; createdAt = Time.now() };
            Map.add(annotations, Text.compare, id, a);
            Index.add(annotationsByLink, Text.compare, linkId, id);
            #ok(a)
          };
        }
      };
    }
  };

  public shared ({ caller }) func markAnnotationSeen(id : Text) : async Result.Result<(), Text> {
    switch (Map.get(annotations, Text.compare, id)) {
      case null #err("Annotation not found");
      case (?a) {
        switch (Map.get(links, Text.compare, a.linkId)) {
          case null #err("Link not found");
          case (?l) {
            if (l.owner != caller) return #err("Not your annotation");
            Map.add(annotations, Text.compare, id, { a with seen = true });
            #ok(())
          };
        }
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyMentorLinks() : async [MentorLink] {
    Index.rows(linksByOwner, Principal.compare, caller, links)
  };

  public shared query ({ caller }) func getMentorDashboard() : async [MentorLink] {
    // Revoking a link must also take it off the mentor's dashboard.
    Array.filter<MentorLink>(Index.rows(linksByMentor, Principal.compare, caller, links), func(l) { not l.revoked })
  };

  public shared query ({ caller }) func getAnnotationsForLink(linkId : Text) : async Result.Result<[Annotation], Text> {
    switch (Map.get(links, Text.compare, linkId)) {
      case null #err("Link not found");
      case (?l) {
        if (l.owner != caller and l.mentorPrincipal != ?caller) return #err("Not authorized");
        #ok(Index.rows(annotationsByLink, Text.compare, linkId, annotations))
      };
    }
  };

  // Annotations on every link the caller owns.
  func myAnnotations(caller : Principal) : List.List<Annotation> {
    let buf = List.empty<Annotation>();
    for (linkId in Index.ids(linksByOwner, Principal.compare, caller).values()) {
      for (a in Index.rows(annotationsByLink, Text.compare, linkId, annotations).values()) List.add(buf, a);
    };
    buf
  };

  public shared query ({ caller }) func getMyAnnotations() : async [Annotation] {
    List.toArray(myAnnotations(caller))
  };

  public shared query ({ caller }) func getMyUnseenAnnotationCount() : async Nat {
    var count = 0;
    for (a in List.values(myAnnotations(caller))) { if (not a.seen) count += 1 };
    count
  };

  // ─── Account deletion ──────────────────────────────────────────────────────

  /// Called by the user canister when an official deletes their account:
  /// deletes the exam answers they shared (with the notes on them), and
  /// for links they mentored, deletes their notes and closes the link
  /// rather than leaving it open for someone else to claim. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    for (id in Index.take(linksByOwner, Principal.compare, p).values()) {
      switch (Map.take(links, Text.compare, id)) {
        case (?l) {
          Map.remove(tokenIndex, Text.compare, l.token);
          switch (l.mentorPrincipal) { case (?m) Index.removeId(linksByMentor, Principal.compare, m, id); case null {} };
        };
        case null {};
      };
      for (aid in Index.take(annotationsByLink, Text.compare, id).values()) Map.remove(annotations, Text.compare, aid);
    };
    for (id in Index.take(linksByMentor, Principal.compare, p).values()) {
      switch (Map.get(links, Text.compare, id)) {
        case (?l) Map.add(links, Text.compare, id, { l with mentorPrincipal = null; revoked = true });
        case null {};
      };
      for (aid in Index.ids(annotationsByLink, Text.compare, id).values()) {
        switch (Map.get(annotations, Text.compare, aid)) {
          case (?a) {
            if (a.mentor == p) {
              Map.remove(annotations, Text.compare, aid);
              Index.removeId(annotationsByLink, Text.compare, id, aid);
            };
          };
          case null {};
        };
      };
    };
    #ok(())
  };

  public query func metrics() : async { linkCount : Nat; annotationCount : Nat } {
    { linkCount = Map.size(links); annotationCount = Map.size(annotations) }
  };
}
