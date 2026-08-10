import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Result "mo:base/Result";
import Principal "mo:base/Principal";
import ExperimentalCycles "mo:base/ExperimentalCycles";

persistent actor AiProxy {

  var adminPrincipal : ?Principal = null;

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null { adminPrincipal := ?p; #ok(()) };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  // IC HTTP outcall — used for ElevenLabs TTS and future AI calls
  // Returns raw response body bytes; caller is responsible for uploading to R2.
  public shared ({ caller }) func httpPost(
    url      : Text,
    headers  : [(Text, Text)],
    bodyJson : Text,
    maxBytes : Nat64,
  ) : async Result.Result<Blob, Text> {
    if (not isAdmin(caller)) return #err("Admin only");

    let httpHeaders = Array.map<(Text, Text), { name : Text; value : Text }>(
      headers, func((k, v)) { { name = k; value = v } }
    );

    ExperimentalCycles.add(100_000_000);

    let resp = await (actor "aaaaa-aa" : actor {
      http_request : ({
        url            : Text;
        max_response_bytes : ?Nat64;
        headers        : [{ name : Text; value : Text }];
        body           : ?Blob;
        method         : { #get; #post; #head };
        transform      : ?{ function : shared query ({ response : { status : Nat; headers : [{ name : Text; value : Text }]; body : Blob }; context : Blob }) -> async { status : Nat; headers : [{ name : Text; value : Text }]; body : Blob }; context : Blob };
      }) -> async { status : Nat; headers : [{ name : Text; value : Text }]; body : Blob };
    }).http_request({
      url                = url;
      max_response_bytes = ?maxBytes;
      headers            = httpHeaders;
      body               = ?Text.encodeUtf8(bodyJson);
      method             = #post;
      transform          = null;
    });

    if (resp.status == 200) #ok(resp.body) else #err("HTTP " # Nat.toText(resp.status))
  };

  public query func metrics() : async { ok : Bool } { { ok = true } };
}
