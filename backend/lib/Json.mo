/// Just enough JSON to read flat fields from an API response (Stripe's, in
/// lib/Billing.mo and lib/License.mo; Cloudflare's, in lib/Clips.mo): the
/// scalar fields at the top level of an object, a nested object's fields on
/// request (getObject), and an integer at a path through nested objects and
/// arrays (getIntPath). A key inside a nested value can never be mistaken
/// for a top-level one. Unit-tested in test/Json.test.mo.
import Char "mo:core/Char";
import Int "mo:core/Int";
import List "mo:core/List";
import Nat32 "mo:core/Nat32";
import Text "mo:core/Text";

module {

  public type Value = {
    #text : Text;
    #int : Int;
    #bool : Bool;
    #null_;
    #obj : Text; // a nested object, as its raw JSON (read it with getObject)
    #arr : Text; // an array, as its raw JSON (read into it with getIntPath)
    #other; // a non-integer number
  };

  public type Fields = [(Text, Value)];

  /// The top-level fields of a JSON object, or null if `json` isn't one.
  public func fields(json : Text) : ?Fields = members(json, false);

  /// The elements of a JSON array keyed "0", "1", ..., or null if `json`
  /// isn't one.
  func elements(json : Text) : ?Fields = members(json, true);

  func members(json : Text, array : Bool) : ?Fields {
    let cs = json.toArray();
    let n = cs.size();
    var i = 0;
    let out = List.empty<(Text, Value)>();

    func peek() : ?Char = if (i < n) ?cs[i] else null;
    func ws() { while (i < n and (cs[i] == ' ' or cs[i] == '\n' or cs[i] == '\r' or cs[i] == '\t')) i += 1 };
    func eat(c : Char) : Bool { if (i < n and cs[i] == c) { i += 1; true } else false };

    func hex4() : ?Nat32 {
      if (i + 4 > n) return null;
      var v : Nat32 = 0;
      for (k in [0, 1, 2, 3].values()) {
        let c = cs[i + k].toNat32();
        let d : Nat32 = if (c >= 48 and c <= 57) c - 48 else if (c >= 97 and c <= 102) c - 87 else if (c >= 65 and c <= 70) c - 55 else return null;
        v := v * 16 + d;
      };
      i += 4;
      ?v
    };

    func str() : ?Text {
      if (not eat('\"')) return null;
      var t = "";
      loop {
        if (i >= n) return null;
        let c = cs[i];
        i += 1;
        if (c == '\"') return ?t;
        if (c == '\\') {
          if (i >= n) return null;
          let e = cs[i];
          i += 1;
          t #= switch e {
            case '\"' "\"";
            case '\\' "\\";
            case '/' "/";
            case 'b' "\u{8}";
            case 'f' "\u{c}";
            case 'n' "\n";
            case 'r' "\r";
            case 't' "\t";
            case 'u' {
              let hi = switch (hex4()) { case (?v) v; case null return null };
              let code : Nat32 = if (hi >= 0xD800 and hi <= 0xDBFF and i + 6 <= n and cs[i] == '\\' and cs[i + 1] == 'u') {
                i += 2;
                let lo = switch (hex4()) { case (?v) v; case null return null };
                0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
              } else hi;
              if (code >= 0xD800 and code <= 0xDFFF) "\u{FFFD}" else code.toChar().toText()
            };
            case _ return null;
          };
        } else t #= c.toText();
      }
    };

    func word(w : Text) : Bool {
      let ws_ = w.toArray();
      if (i + ws_.size() > n) return false;
      for (k in ws_.keys()) { if (cs[i + k] != ws_[k]) return false };
      i += ws_.size();
      true
    };

    func number() : ?Value {
      let start = i;
      var integer = true;
      while (i < n and (cs[i] == '-' or cs[i] == '+' or cs[i] == '.' or cs[i] == 'e' or cs[i] == 'E' or (cs[i] >= '0' and cs[i] <= '9'))) {
        if (cs[i] == '.' or cs[i] == 'e' or cs[i] == 'E' or (cs[i] == '+')) integer := false;
        i += 1;
      };
      if (i == start) return null;
      if (not integer) return ?#other;
      var digits = "";
      var k = start;
      while (k < i) { digits #= cs[k].toText(); k += 1 };
      switch (Int.fromText(digits)) { case (?v) ?#int(v); case null null }
    };

    // Skips a nested object or array, minding strings so a bracket inside
    // one doesn't count.
    func skipNested() : Bool {
      var depth = 0;
      while (i < n) {
        let c = cs[i];
        if (c == '\"') { if (str() == null) return false } else {
          i += 1;
          if (c == '{' or c == '[') depth += 1
          else if (c == '}' or c == ']') {
            if (depth == 0) return false;
            depth -= 1;
            if (depth == 0) return true;
          };
        };
      };
      false
    };

    // A nested object or array, as its raw text.
    func nested() : ?Text {
      let start = i;
      if (not skipNested()) return null;
      var raw = "";
      var k = start;
      while (k < i) { raw #= cs[k].toText(); k += 1 };
      ?raw
    };

    func value() : ?Value {
      switch (peek()) {
        case (?'\"') switch (str()) { case (?t) ?#text(t); case null null };
        case (?'{') switch (nested()) { case (?raw) ?#obj(raw); case null null };
        case (?'[') switch (nested()) { case (?raw) ?#arr(raw); case null null };
        case (?'t') if (word("true")) ?#bool(true) else null;
        case (?'f') if (word("false")) ?#bool(false) else null;
        case (?'n') if (word("null")) ?#null_ else null;
        case _ number();
      }
    };

    let (open, close) = if array ('[', ']') else ('{', '}');
    ws();
    if (not eat(open)) return null;
    ws();
    if (not eat(close)) {
      var index = 0;
      label items loop {
        ws();
        let k = if array { index.toText() } else switch (str()) { case (?k) k; case null return null };
        index += 1;
        ws();
        if (not array and not eat(':')) return null;
        ws();
        let v = switch (value()) { case (?v) v; case null return null };
        out.add((k, v));
        ws();
        if (eat(',')) continue items;
        if (eat(close)) break items;
        return null;
      };
    };
    ws();
    if (i != n) return null;
    ?out.toArray()
  };

  public func get(f : Fields, key : Text) : ?Value {
    for ((k, v) in f.values()) { if (k == key) return ?v };
    null
  };

  public func getText(f : Fields, key : Text) : ?Text = switch (get(f, key)) { case (?#text(t)) ?t; case _ null };

  public func getInt(f : Fields, key : Text) : ?Int = switch (get(f, key)) { case (?#int(v)) ?v; case _ null };

  /// The fields of a nested object (`{"result": {...}}`).
  public func getObject(f : Fields, key : Text) : ?Fields = switch (get(f, key)) { case (?#obj(raw)) fields(raw); case _ null };

  /// The integer at `path` through nested objects (by key) and arrays (by
  /// index, as text: ["items", "data", "0", "quantity"]), starting from the
  /// object `json`. null when any step is missing or the wrong type.
  public func getIntPath(json : Text, path : [Text]) : ?Int {
    if (path.size() == 0) return null;
    var current : Fields = switch (fields(json)) { case (?f) f; case null return null };
    var step = 0;
    while (step + 1 < path.size()) {
      current := switch (get(current, path[step])) {
        case (?#obj(raw)) switch (fields(raw)) { case (?f) f; case null return null };
        case (?#arr(raw)) switch (elements(raw)) { case (?f) f; case null return null };
        case _ return null;
      };
      step += 1;
    };
    getInt(current, path[step])
  };

  func escape(t : Text) : Text {
    var out = "";
    for (c in t.chars()) {
      out #= switch c {
        case '\"' "\\\"";
        case '\\' "\\\\";
        case '\n' "\\n";
        case '\r' "\\r";
        case '\t' "\\t";
        case _ {
          let code = c.toNat32();
          if (code < 0x20) {
            let h = "0123456789abcdef".toArray();
            "\\u00" # h[(code / 16).toNat()].toText() # h[(code % 16).toNat()].toText()
          } else c.toText()
        };
      };
    };
    out
  };

  /// A compact object holding only `keys` that are top-level scalars of
  /// `json`, in the order given. Used to reduce an outcall response to a
  /// canonical form every replica agrees on. "{}" for malformed input.
  public func project(json : Text, keys : [Text]) : Text = projectWithPaths(json, keys, []);

  /// project, plus integers read from deeper in `json` (getIntPath), each
  /// added at the top level under its alias.
  public func projectWithPaths(json : Text, keys : [Text], paths : [(Text, [Text])]) : Text {
    let f = switch (fields(json)) { case (?f) f; case null return "{}" };
    let parts = List.empty<Text>();
    for (k in keys.values()) {
      let rendered = switch (get(f, k)) {
        case (?#text(t)) ?("\"" # escape(t) # "\"");
        case (?#int(v)) ?v.toText();
        case (?#bool(b)) ?(if b "true" else "false");
        case (?#null_) ?"null";
        case _ null;
      };
      switch rendered { case (?r) parts.add("\"" # escape(k) # "\":" # r); case null {} };
    };
    for ((alias, path) in paths.values()) {
      switch (getIntPath(json, path)) { case (?v) parts.add("\"" # escape(alias) # "\":" # v.toText()); case null {} };
    };
    "{" # parts.values().join(",") # "}"
  };
}
