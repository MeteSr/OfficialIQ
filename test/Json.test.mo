import { test; suite; expect } "mo:test";
import Json "../backend/lib/Json";
import Text "mo:core/Text";

func text(j : Text, k : Text) : ?Text = switch (Json.fields(j)) { case (?f) Json.getText(f, k); case null null };
func int(j : Text, k : Text) : ?Int = switch (Json.fields(j)) { case (?f) Json.getInt(f, k); case null null };

suite("fields", func() {
  test("reads top-level strings, numbers, booleans and null", func() {
    let j = "{\"id\": \"cs_1\", \"amount\": 799, \"live\": false, \"customer\": null, \"neg\": -5}";
    expect.option(text(j, "id"), func t = t, Text.equal).equal(?"cs_1");
    expect.option(int(j, "amount"), func i = debug_show i, func(a : Int, b : Int) : Bool = a == b).equal(?799);
    expect.option(int(j, "neg"), func i = debug_show i, func(a : Int, b : Int) : Bool = a == b).equal(?-5);
    expect.bool(text(j, "customer") == null).isTrue();
    expect.bool(text(j, "missing") == null).isTrue();
  });

  test("skips nested objects and arrays, so their keys don't leak to the top", func() {
    let j = "{\"items\": {\"data\": [{\"status\": \"inner\", \"x\": [1, {\"status\": \"deeper\"}]}]}, \"status\": \"active\"}";
    expect.option(text(j, "status"), func t = t, Text.equal).equal(?"active");
    expect.bool(text(j, "items") == null).isTrue();
  });

  test("decodes escapes and doesn't end a string at an escaped quote", func() {
    let j = "{\"a\": \"say \\\"hi\\\" \\\\ \\/ \\n\", \"b\": \"\\u0041\"}";
    expect.option(text(j, "a"), func t = t, Text.equal).equal(?"say \"hi\" \\ / \n");
    expect.option(text(j, "b"), func t = t, Text.equal).equal(?"A");
  });

  test("treats a brace inside a string as text", func() {
    let j = "{\"note\": \"a } b { c\", \"status\": \"complete\"}";
    expect.option(text(j, "status"), func t = t, Text.equal).equal(?"complete");
  });

  test("rejects input that isn't an object", func() {
    expect.bool(Json.fields("[1,2]") == null).isTrue();
    expect.bool(Json.fields("{\"a\": ") == null).isTrue();
    expect.bool(Json.fields("{\"a\" 1}") == null).isTrue();
    expect.bool(Json.fields("") == null).isTrue();
  });

  test("ignores a non-integer number rather than misreading it", func() {
    expect.bool(int("{\"x\": 1.5}", "x") == null).isTrue();
  });
});

suite("project", func() {
  test("keeps only the named scalar fields, in the order named", func() {
    let j = "{\"z\": 1, \"status\": \"open\", \"nested\": {\"a\": 1}, \"id\": \"cs_\\\"q\"}";
    expect.text(Json.project(j, ["id", "status", "nested", "missing"])).equal("{\"id\":\"cs_\\\"q\",\"status\":\"open\"}");
  });
  test("gives an empty object for malformed input", func() {
    expect.text(Json.project("nope", ["id"])).equal("{}");
  });
  test("round-trips through fields", func() {
    let p = Json.project("{\"n\": -3, \"b\": true, \"s\": \"x\\ny\", \"z\": null}", ["s", "n", "b", "z"]);
    expect.option(text(p, "s"), func t = t, Text.equal).equal(?"x\ny");
    expect.option(int(p, "n"), func i = debug_show i, func(a : Int, b : Int) : Bool = a == b).equal(?-3);
  });
});

suite("getObject", func() {
  test("reads the fields of a nested object, as Cloudflare's {\"result\": {...}} replies have", func() {
    let j = "{\"success\": true, \"result\": {\"uid\": \"abc123\", \"uploadURL\": \"https://upload.example/x\", \"meta\": {\"k\": \"v\"}}, \"errors\": []}";
    let inner = switch (Json.fields(j)) { case (?f) Json.getObject(f, "result"); case null null };
    let uid = switch inner { case (?r) Json.getText(r, "uid"); case null null };
    expect.option(uid, func t = t, Text.equal).equal(?"abc123");
    let url = switch inner { case (?r) Json.getText(r, "uploadURL"); case null null };
    expect.option(url, func t = t, Text.equal).equal(?"https://upload.example/x");
    // Arrays and scalars are not objects.
    let errs = switch (Json.fields(j)) { case (?f) Json.getObject(f, "errors"); case null null };
    expect.bool(errs == null).isTrue();
  });
});

func intEq(a : Int, b : Int) : Bool = a == b;

suite("getIntPath", func() {
  // A Stripe Subscription keeps its seat count in its first item.
  let sub = "{\"id\": \"sub_1\", \"items\": {\"object\": \"list\", \"data\": [{\"id\": \"si_1\", \"quantity\": 12, \"price\": {\"id\": \"price_1\"}}, {\"quantity\": 3}]}, \"status\": \"active\"}";

  test("follows nested objects and array indexes", func() {
    expect.option(Json.getIntPath(sub, ["items", "data", "0", "quantity"]), func i = debug_show i, intEq).equal(?12);
    expect.option(Json.getIntPath(sub, ["items", "data", "1", "quantity"]), func i = debug_show i, intEq).equal(?3);
  });
  test("reads a top-level integer with a one-step path", func() {
    expect.option(Json.getIntPath("{\"n\": 7}", ["n"]), func i = debug_show i, intEq).equal(?7);
  });
  test("gives null for a missing key or index", func() {
    expect.bool(Json.getIntPath(sub, ["items", "data", "2", "quantity"]) == null).isTrue();
    expect.bool(Json.getIntPath(sub, ["items", "nope", "0", "quantity"]) == null).isTrue();
    expect.bool(Json.getIntPath(sub, []) == null).isTrue();
  });
  test("gives null for the wrong type along the way or at the end", func() {
    expect.bool(Json.getIntPath(sub, ["status", "x"]) == null).isTrue();
    expect.bool(Json.getIntPath(sub, ["items", "data", "0", "price"]) == null).isTrue();
    expect.bool(Json.getIntPath(sub, ["items", "object"]) == null).isTrue();
    // An index into an object, and a key into an array.
    expect.bool(Json.getIntPath(sub, ["items", "0"]) == null).isTrue();
    expect.bool(Json.getIntPath(sub, ["items", "data", "first", "quantity"]) == null).isTrue();
  });
  test("gives null for malformed JSON", func() {
    expect.bool(Json.getIntPath("{\"items\": {\"data\": [{\"quantity\": 1}", ["items", "data", "0", "quantity"]) == null).isTrue();
    expect.bool(Json.getIntPath("[1, 2]", ["0"]) == null).isTrue();
  });
  test("isn't fooled by brackets inside strings", func() {
    let j = "{\"a\": {\"data\": [\"x]\", {\"q\": 5}]}}";
    expect.option(Json.getIntPath(j, ["a", "data", "1", "q"]), func i = debug_show i, intEq).equal(?5);
  });
});
