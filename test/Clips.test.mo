import { test; suite; expect } "mo:test";
import Clips "../backend/lib/Clips";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

let uploader = Principal.fromText("2vxsx-fae");
let other = Principal.fromText("aaaaa-aa");

let question : Clips.ClipQuestion = {
  stem = "What's the call?";
  choices = [{ id = "a"; text = "Block" }, { id = "b"; text = "Charge" }];
  correctId = "b";
  explanation = "The defender was set.";
};

let input : Clips.ClipInput = {
  uploadId = "uid1"; sportId = "s"; articleId = "s:art4"; sectionKey = ?"s:art4:s1"; playId = null;
  title = "Block or charge"; description = ""; callAtSec = ?7; question = ?question;
  visibility = #everyone; rightsAttested = true;
};

func clip(visibility : Clips.Visibility, status : Clips.Status) : Clips.Clip = {
  id = "c1"; uploadId = "uid1"; sportId = "s"; articleId = "s:art4"; sectionKey = null; playId = null;
  title = "T"; description = ""; callAtSec = null; question = null; visibility; uploader;
  rights = { statement = Clips.RIGHTS_STATEMENT; attestedAt = 1 }; status; createdAt = 1; reviewedBy = null;
};

func err(t : ?Text) : Text = switch t { case (?e) e; case null "" };

suite("validate", func() {
  test("accepts a complete clip, with or without a call to make", func() {
    expect.bool(Clips.validate(input) == null).isTrue();
    expect.bool(Clips.validate({ input with callAtSec = null; question = null }) == null).isTrue();
  });

  test("requires the rights statement, a title, and a rule", func() {
    expect.text(err(Clips.validate({ input with rightsAttested = false }))).equal("rights");
    expect.text(err(Clips.validate({ input with title = "  " }))).equal("title");
    expect.text(err(Clips.validate({ input with articleId = "" }))).equal("articleId");
  });

  test("needs both a call point and its question, and a question that works", func() {
    expect.text(err(Clips.validate({ input with question = null }))).equal("question");
    expect.text(err(Clips.validate({ input with callAtSec = null }))).equal("callAtSec");
    expect.text(err(Clips.validate({ input with question = ?{ question with correctId = "z" } }))).equal("question");
    expect.text(err(Clips.validate({ input with question = ?{ question with choices = [question.choices[0]] } }))).equal("question");
  });
});

suite("who may see and review a clip", func() {
  test("an approved clip for everyone is seen by everyone; an association's only by its members", func() {
    expect.bool(Clips.canView(clip(#everyone, #approved), other, #none)).isTrue();
    expect.bool(Clips.canView(clip(#association("a1"), #approved), other, #none)).isFalse();
    expect.bool(Clips.canView(clip(#association("a1"), #approved), other, #member)).isTrue();
  });

  test("a clip waiting for review is seen by its uploader and its reviewers only", func() {
    expect.bool(Clips.canView(clip(#everyone, #pending), uploader, #none)).isTrue();
    expect.bool(Clips.canView(clip(#everyone, #pending), other, #none)).isFalse();
    expect.bool(Clips.canView(clip(#association("a1"), #pending), other, #coordinator)).isTrue();
    expect.bool(Clips.canView(clip(#association("a1"), #pending), other, #member)).isFalse();
  });

  test("admins review clips for everyone; an association's coordinator (or an admin) reviews its clips", func() {
    expect.bool(Clips.canReview(clip(#everyone, #pending), true, #none)).isTrue();
    expect.bool(Clips.canReview(clip(#everyone, #pending), false, #coordinator)).isFalse();
    expect.bool(Clips.canReview(clip(#association("a1"), #pending), false, #coordinator)).isTrue();
    expect.bool(Clips.canReview(clip(#association("a1"), #pending), false, #member)).isFalse();
    expect.bool(Clips.canReview(clip(#association("a1"), #pending), true, #none)).isTrue();
  });
});

suite("Cloudflare Stream", func() {
  test("reads a direct upload's id and URL", func() {
    let body = "{\"result\":{\"uploadURL\":\"https://upload.videodelivery.net/abc\",\"uid\":\"abc\",\"watermark\":null},\"success\":true,\"errors\":[],\"messages\":[]}";
    switch (Clips.parseDirectUpload(body)) {
      case (?u) { expect.text(u.uid).equal("abc"); expect.text(u.uploadUrl).equal("https://upload.videodelivery.net/abc") };
      case null expect.bool(false).isTrue();
    };
    expect.bool(Clips.parseDirectUpload("{\"success\":false,\"errors\":[{\"code\":10000}]}") == null).isTrue();
  });

  test("asks for an upload that must be played with a signed link", func() {
    expect.text(Clips.directUploadBody(120)).equal("{\"maxDurationSeconds\":120,\"requireSignedURLs\":true}");
  });

  test("reads a signed token and a video's state", func() {
    expect.option(Clips.parseToken("{\"result\":{\"token\":\"eyJ.x.y\"},\"success\":true}"), func t = t, Text.equal).equal(?"eyJ.x.y");
    let ready = "{\"result\":{\"uid\":\"abc\",\"readyToStream\":true,\"duration\":12,\"status\":{\"state\":\"ready\"}},\"success\":true}";
    expect.bool(Clips.parseReady(ready) == ?true).isTrue();
    expect.bool(Clips.parseReady("{\"result\":{\"readyToStream\":false},\"success\":true}") == ?false).isTrue();
  });

  test("builds the MP4 link for a signed token, and keeps a token for under its hour", func() {
    expect.text(Clips.mp4Url("cust1", "tok")).equal("https://customer-cust1.cloudflarestream.com/tok/downloads/default.mp4");
    let minute : Int = 60_000_000_000;
    expect.bool(Clips.tokenFresh(0, 30 * minute)).isTrue();
    expect.bool(Clips.tokenFresh(0, 55 * minute)).isFalse();
  });
});
