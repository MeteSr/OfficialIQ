import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

// Skill: use `ic:aaaaa-aa` compiler import, not actor cast of aaaaa-aa
import IC "ic:aaaaa-aa";

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

  // Transform function strips non-deterministic headers so all replicas agree
  public query func transform({ response : IC.http_request_result; context : Blob }) : async IC.http_request_result {
    { response with headers = [] }
  };

  // HTTPS outcall — used for ElevenLabs TTS audio generation
  // Returns raw response body bytes; caller uploads to Cloudflare R2.
  public shared ({ caller }) func httpPost(
    url      : Text,
    headers  : [IC.HttpHeader],
    bodyJson : Text,
    maxBytes : Nat64,
  ) : async Result.Result<Blob, Text> {
    if (not isAdmin(caller)) return #err("Admin only");

    let resp = await IC.http_request({
      url;
      max_response_bytes = ?maxBytes;
      headers;
      body               = ?Text.encodeUtf8(bodyJson);
      method             = #post;
      transform          = ?{ function = transform; context = Blob.fromArray([]) };
    });

    if (resp.status == 200) #ok(resp.body) else #err("HTTP " # Nat.toText(resp.status))
  };

  public query func metrics() : async { ok : Bool } { { ok = true } };
}
