import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

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

  var nextLinkId       : Nat = 0;
  var nextAnnotationId : Nat = 0;

  let TTL_NS : Int = 30 * 24 * 3600 * 1_000_000_000;

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createMentorLink(
    examId        : Text,
    sportId       : Text,
    score         : Nat,
    avgElapsedSec : ?Nat,
    answers       : [AnswerSnapshot],
  ) : async Result.Result<MentorLink, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id    = "mtl" # Nat.toText(nextLinkId);
    let token = "tok" # Nat.toText(nextLinkId);
    nextLinkId += 1;
    let now = Time.now();
    let link : MentorLink = {
      id; token; owner = caller; mentorPrincipal = null;
      examId; sportId; score; avgElapsedSec; answers;
      revoked = false; createdAt = now; expiresAt = now + TTL_NS;
    };
    Map.add(links, Text.compare, id, link);
    Map.add(tokenIndex, Text.compare, token, id);
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
            let id = "an" # Nat.toText(nextAnnotationId);
            nextAnnotationId += 1;
            let a : Annotation = { id; linkId; questionId; mentor = caller; note; seen = false; createdAt = Time.now() };
            Map.add(annotations, Text.compare, id, a);
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
    let buf = List.empty<MentorLink>();
    for ((_, l) in Map.entries(links)) {
      if (l.owner == caller) List.add(buf, l);
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMentorDashboard() : async [MentorLink] {
    let buf = List.empty<MentorLink>();
    for ((_, l) in Map.entries(links)) {
      if (l.mentorPrincipal == ?caller) List.add(buf, l);
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getAnnotationsForLink(linkId : Text) : async Result.Result<[Annotation], Text> {
    switch (Map.get(links, Text.compare, linkId)) {
      case null #err("Link not found");
      case (?l) {
        if (l.owner != caller and l.mentorPrincipal != ?caller) return #err("Not authorized");
        let buf = List.empty<Annotation>();
        for ((_, a) in Map.entries(annotations)) {
          if (a.linkId == linkId) List.add(buf, a);
        };
        #ok(List.toArray(buf))
      };
    }
  };

  public shared query ({ caller }) func getMyAnnotations() : async [Annotation] {
    let buf = List.empty<Annotation>();
    for ((_, a) in Map.entries(annotations)) {
      switch (Map.get(links, Text.compare, a.linkId)) {
        case (?l) { if (l.owner == caller) List.add(buf, a) };
        case null {};
      }
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyUnseenAnnotationCount() : async Nat {
    var count = 0;
    for ((_, a) in Map.entries(annotations)) {
      if (not a.seen) {
        switch (Map.get(links, Text.compare, a.linkId)) {
          case (?l) { if (l.owner == caller) count += 1 };
          case null {};
        }
      };
    };
    count
  };

  public query func metrics() : async { linkCount : Nat; annotationCount : Nat } {
    { linkCount = Map.size(links); annotationCount = Map.size(annotations) }
  };
}
