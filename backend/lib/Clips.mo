/// Game clips (the clip library in the content canister): what a clip is,
/// which ones are complete, who may see and review them, and the Cloudflare
/// Stream requests and replies behind upload and playback. Unit-tested in
/// test/Clips.test.mo.
///
/// Every clip is uploaded to Cloudflare Stream to be played only through a
/// signed link, which the content canister hands to a viewer it has
/// checked; the MP4 link plays in a plain <video>, which the app pauses
/// at the call.
import Json "Json";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Nat "mo:core/Nat";

module {

  /// What an uploader agrees to before a clip is saved.
  public let RIGHTS_STATEMENT : Text = "I filmed this footage or have permission to share it for officials' training, and the people identifiable in it agreed to its use.";

  public type Visibility = { #everyone; #association : Text };
  public type Status = { #pending; #approved; #rejected };
  /// A viewer's place in the association a clip is for.
  public type Membership = { #none; #member; #coordinator };

  public type Choice = { id : Text; text : Text };
  /// "You make the call": the question asked when the clip stops at `callAtSec`.
  public type ClipQuestion = { stem : Text; choices : [Choice]; correctId : Text; explanation : Text };

  public type ClipInput = {
    uploadId : Text; // the Cloudflare Stream video, from startClipUpload
    sportId : Text;
    articleId : Text;
    sectionKey : ?Text; // a rule section, as lib/questionGen's ruleSections keys them
    playId : ?Text; // an approved ruling it shows
    title : Text;
    description : Text;
    callAtSec : ?Nat;
    question : ?ClipQuestion;
    visibility : Visibility;
    rightsAttested : Bool;
  };

  public type Clip = {
    id : Text;
    uploadId : Text;
    sportId : Text;
    articleId : Text;
    sectionKey : ?Text;
    playId : ?Text;
    title : Text;
    description : Text;
    callAtSec : ?Nat;
    question : ?ClipQuestion;
    visibility : Visibility;
    uploader : Principal;
    rights : { statement : Text; attestedAt : Int };
    status : Status;
    createdAt : Int;
    reviewedBy : ?Principal;
  };

  public let MAX_TITLE_CHARS = 120;
  public let MAX_TEXT_CHARS = 2_000;
  public let MAX_DURATION_SEC = 180;

  func blank(t : Text) : Bool = t.trim(#char ' ').size() == 0;

  func badQuestion(q : ClipQuestion) : Bool {
    if (blank(q.stem) or blank(q.explanation) or q.stem.size() > MAX_TEXT_CHARS or q.explanation.size() > MAX_TEXT_CHARS) return true;
    if (q.choices.size() < 2 or q.choices.size() > 5) return true;
    var found = false;
    for (k in q.choices.keys()) {
      let c = q.choices[k];
      if (blank(c.id) or blank(c.text) or c.text.size() > MAX_TITLE_CHARS * 2) return true;
      for (j in Nat.range(0, k)) { if (q.choices[j].id == c.id) return true };
      if (c.id == q.correctId) found := true;
    };
    not found
  };

  /// The first field that makes a clip incomplete, or null.
  public func validate(i : ClipInput) : ?Text {
    if (not i.rightsAttested) return ?"rights";
    if (blank(i.uploadId)) return ?"uploadId";
    if (blank(i.sportId)) return ?"sportId";
    if (blank(i.articleId)) return ?"articleId";
    if (blank(i.title) or i.title.size() > MAX_TITLE_CHARS) return ?"title";
    if (i.description.size() > MAX_TEXT_CHARS) return ?"description";
    switch (i.callAtSec, i.question) {
      case (null, null) {};
      case (?_, null) return ?"question";
      case (null, ?_) return ?"callAtSec";
      case (?at, ?q) {
        if (at > MAX_DURATION_SEC) return ?"callAtSec";
        if (badQuestion(q)) return ?"question";
      };
    };
    switch (i.visibility) { case (#association(a)) { if (blank(a)) return ?"visibility" }; case (#everyone) {} };
    null
  };

  /// Whether `viewer` may see a clip, given their place in the association it is for.
  public func canView(c : Clip, viewer : Principal, m : Membership) : Bool {
    switch (c.status) {
      case (#approved) switch (c.visibility) { case (#everyone) true; case (#association(_)) m != #none };
      case (_) viewer == c.uploader or (switch (c.visibility) { case (#association(_)) m == #coordinator; case (#everyone) false });
    }
  };

  /// Admins review clips for everyone; an association's coordinator, or an admin, reviews its clips.
  public func canReview(c : Clip, isAdmin : Bool, m : Membership) : Bool {
    isAdmin or (switch (c.visibility) { case (#association(_)) m == #coordinator; case (#everyone) false })
  };

  // ─── Cloudflare Stream ─────────────────────────────────────────────────────

  public let API = "https://api.cloudflare.com/client/v4/accounts/";

  public func directUploadBody(maxDurationSec : Nat) : Text =
    "{\"maxDurationSeconds\":" # maxDurationSec.toText() # ",\"requireSignedURLs\":true}";

  func result(body : Text) : ?Json.Fields {
    switch (Json.fields(body)) { case (?f) Json.getObject(f, "result"); case null null }
  };

  /// The video id and one-time upload URL from POST …/stream/direct_upload.
  public func parseDirectUpload(body : Text) : ?{ uid : Text; uploadUrl : Text } {
    let r = switch (result(body)) { case (?r) r; case null return null };
    switch (Json.getText(r, "uid"), Json.getText(r, "uploadURL")) {
      case (?uid, ?uploadUrl) ?{ uid; uploadUrl };
      case _ null;
    }
  };

  /// The signed token from POST …/stream/<uid>/token (valid for an hour).
  public func parseToken(body : Text) : ?Text {
    switch (result(body)) { case (?r) Json.getText(r, "token"); case null null }
  };

  /// Whether a video has finished processing, from GET …/stream/<uid>.
  public func parseReady(body : Text) : ?Bool {
    switch (result(body)) {
      case (?r) switch (Json.get(r, "readyToStream")) { case (?#bool(b)) ?b; case _ null };
      case null null;
    }
  };

  public func mp4Url(customerCode : Text, token : Text) : Text =
    "https://customer-" # customerCode # ".cloudflarestream.com/" # token # "/downloads/default.mp4";

  /// A signed token is good for an hour; one is reused for 50 minutes.
  public func tokenFresh(mintedAt : Int, now : Int) : Bool = now - mintedAt < 50 * 60_000_000_000;
}
