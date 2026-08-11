import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";

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

  public shared query ({ caller }) func isAdminCaller() : async Bool { isAdmin(caller) };

  // Transform function strips non-deterministic headers so all replicas agree
  public query func transform({ response : IC.http_request_result; context : Blob }) : async IC.http_request_result {
    { response with headers = [] }
  };

  // HTTPS outcall — used for ElevenLabs TTS audio generation.
  // Returns raw response body bytes; stored on-chain by the caller.
  //
  // `cycles` must cover the IC's http_request fee, which scales with
  // maxBytes — the caller computes and attaches it since the management
  // canister traps the whole call if too few cycles are attached.
  public shared ({ caller }) func httpPost(
    url      : Text,
    headers  : [IC.http_header],
    bodyJson : Text,
    maxBytes : Nat64,
    cycles   : Nat,
  ) : async Result.Result<Blob, Text> {
    if (not isAdmin(caller)) return #err("Admin only");

    let resp = await (with cycles = cycles) IC.http_request({
      url;
      max_response_bytes = ?maxBytes;
      headers;
      body               = ?Text.encodeUtf8(bodyJson);
      method             = #post;
      transform          = ?{ function = transform; context = Blob.fromArray([]) };
      is_replicated      = null;
    });

    if (resp.status == 200) #ok(resp.body) else #err("HTTP " # Nat.toText(resp.status))
  };

  // ─── Rule assistant + scenario generation (Claude) ─────────────────────────
  //
  // The Anthropic API key lives only in stable state here, set once by an
  // admin (see scripts/set-ai-config.sh) — it is never returned by any query,
  // and end users never see or supply it. Unlike httpPost above (generic,
  // admin-only, caller supplies the URL/headers), askRuleAssistant and
  // generatePersonalizedDrills are fixed-purpose: any signed-in official can
  // call them, but they can only ever reach the Claude Messages API with a
  // server-controlled prompt, never an arbitrary URL — that's what makes it
  // safe to expose beyond admins.

  let CLAUDE_API_URL : Text = "https://api.anthropic.com/v1/messages";
  let ANTHROPIC_VERSION : Text = "2023-06-01";
  let CLAUDE_MAX_RESPONSE_BYTES : Nat64 = 60_000;
  let CLAUDE_OUTCALL_CYCLES : Nat = 10_000_000_000;

  var anthropicApiKey : ?Text = null;
  var claudeModel : Text = "claude-sonnet-5";
  var promptTemplates : Map.Map<Text, Text> = Map.empty<Text, Text>();

  let DEFAULT_RULE_ASSISTANT_SYSTEM : Text = "You are an officiating rules assistant embedded in the OfficialIQ study app. Answer the official's question clearly and concisely in a few sentences. You MUST cite the specific rule, in the form 'Art. X, Sec. Y' (using the closest citation available in the rulebook context provided), in every answer. If the provided context doesn't cover the question, say so honestly instead of guessing at a citation.";

  let DEFAULT_SCENARIO_SYSTEM : Text = "You generate multiple-choice officiating exam questions for the OfficialIQ study app. Reply with ONLY a JSON array (no prose, no markdown fences) of objects shaped exactly as: {\"stem\": string, \"choices\": [{\"id\": string, \"text\": string}], \"correctId\": string, \"explanation\": string, \"citation\": string, \"difficulty\": \"Beginner\"|\"Intermediate\"|\"Advanced\"|\"Expert\"}. Each question must have exactly 4 choices with ids \"a\",\"b\",\"c\",\"d\", and correctId must match one of them. Ground every question in the supplied rulebook context and cite the specific article/section in the citation field.";

  // Server-side rate limit shared across all Claude-backed end-user actions
  // (rule assistant + personalized drills). The issue asked for tiered
  // Basic/Pro limits, but this app has no subscription/billing system at
  // all — so this is a flat per-official daily cap instead, still fully
  // enforced server-side. Tiered limits can layer on once billing exists.
  let DAILY_LIMIT : Nat = 8;
  let DAY_NS : Int = 86_400_000_000_000;

  type RateLimitEntry = { dayBucket : Int; count : Nat };
  var rateLimits : Map.Map<Principal, RateLimitEntry> = Map.empty<Principal, RateLimitEntry>();

  func usedToday(caller : Principal) : Nat {
    let today = Time.now() / DAY_NS;
    switch (Map.get(rateLimits, Principal.compare, caller)) {
      case (?e) { if (e.dayBucket == today) e.count else 0 };
      case null 0;
    }
  };

  func checkAndConsume(caller : Principal) : Result.Result<(), Text> {
    let today = Time.now() / DAY_NS;
    let count = usedToday(caller);
    if (count >= DAILY_LIMIT) {
      return #err("Daily question limit reached (" # Nat.toText(DAILY_LIMIT) # "/day). Try again tomorrow.");
    };
    Map.add(rateLimits, Principal.compare, caller, { dayBucket = today; count = count + 1 });
    #ok(())
  };

  public shared query ({ caller }) func getMyRateLimitStatus() : async { used : Nat; limitPerDay : Nat; resetAt : Int } {
    let today = Time.now() / DAY_NS;
    { used = usedToday(caller); limitPerDay = DAILY_LIMIT; resetAt = (today + 1) * DAY_NS };
  };

  public query func isConfigured() : async Bool { anthropicApiKey != null };

  public shared ({ caller }) func setAnthropicKey(key : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    anthropicApiKey := ?key;
    #ok(())
  };

  public shared ({ caller }) func setClaudeModel(model : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    claudeModel := model;
    #ok(())
  };

  public shared ({ caller }) func setPromptTemplate(name : Text, content : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    Map.add(promptTemplates, Text.compare, name, content);
    #ok(())
  };

  public shared query ({ caller }) func listPromptTemplates() : async Result.Result<[(Text, Text)], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let buf = List.empty<(Text, Text)>();
    for ((k, v) in Map.entries(promptTemplates)) { List.add(buf, (k, v)) };
    #ok(List.sliceToArray<(Text, Text)>(buf, 0, List.size(buf)))
  };

  func getTemplate(name : Text, fallback : Text) : Text {
    switch (Map.get(promptTemplates, Text.compare, name)) {
      case (?t) t;
      case null fallback;
    }
  };

  // Escapes a Text value for safe embedding inside a JSON string literal.
  // Operates at the byte level: quote/backslash/control-char bytes are all
  // single-byte ASCII, so this can't corrupt multi-byte UTF-8 sequences
  // (whose bytes are always >= 0x80).
  func jsonEscape(t : Text) : Text {
    let bytes = Blob.toArray(Text.encodeUtf8(t));
    let out = List.empty<Nat8>();
    for (b in bytes.vals()) {
      if (b == (34 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 34 : Nat8) }        // "
      else if (b == (92 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 92 : Nat8) }   // \
      else if (b == (10 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 110 : Nat8) }  // \n
      else if (b == (13 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 114 : Nat8) }  // \r
      else if (b == (9 : Nat8))  { List.add(out, 92 : Nat8); List.add(out, 116 : Nat8) }  // \t
      else if (b < (32 : Nat8)) { /* drop other control bytes */ }
      else { List.add(out, b) };
    };
    switch (Text.decodeUtf8(Blob.fromArray(List.sliceToArray<Nat8>(out, 0, List.size(out))))) {
      case (?s) s;
      case null "";
    }
  };

  // Extracts the value of the first `"text":"..."` field from a Claude
  // Messages API response body and unescapes standard JSON string escapes.
  // Not a general JSON parser — relies on Anthropic's known response shape
  // ({"content":[{"type":"text","text":"..."}], ...}). \uXXXX escapes are
  // not decoded (Anthropic emits raw UTF-8 for non-ASCII, not \u escapes).
  func extractClaudeText(body : Text) : ?Text {
    let bytes = Blob.toArray(Text.encodeUtf8(body));
    let needle = Blob.toArray(Text.encodeUtf8("\"text\":\""));
    let n = bytes.size();
    let m = needle.size();

    var startIdx : ?Nat = null;
    var i = 0;
    label search while (i + m <= n) {
      var matched = true;
      var j = 0;
      while (j < m) {
        if (bytes[i + j] != needle[j]) { matched := false };
        j += 1;
      };
      if (matched) { startIdx := ?(i + m); break search };
      i += 1;
    };

    switch startIdx {
      case null null;
      case (?s) {
        let out = List.empty<Nat8>();
        var k = s;
        label extract while (k < n) {
          let c = bytes[k];
          if (c == (34 : Nat8)) { break extract };            // closing "
          if (c == (92 : Nat8) and k + 1 < n) {                // backslash escape
            let nc = bytes[k + 1];
            if (nc == (110 : Nat8)) { List.add(out, 10 : Nat8) }       // \n
            else if (nc == (116 : Nat8)) { List.add(out, 9 : Nat8) }   // \t
            else if (nc == (114 : Nat8)) { List.add(out, 13 : Nat8) }  // \r
            else { List.add(out, nc) };                // \" \\ and others: use literal char
            k += 2;
          } else {
            List.add(out, c);
            k += 1;
          };
        };
        Text.decodeUtf8(Blob.fromArray(List.sliceToArray<Nat8>(out, 0, List.size(out))));
      };
    }
  };

  func callClaude(systemPrompt : Text, userMessage : Text, maxTokens : Nat) : async Result.Result<Text, Text> {
    let key = switch anthropicApiKey {
      case (?k) k;
      case null return #err("The AI assistant isn't configured yet — an admin needs to set the Anthropic API key.");
    };

    let bodyJson = "{\"model\":\"" # claudeModel # "\",\"max_tokens\":" # Nat.toText(maxTokens) #
      ",\"system\":\"" # jsonEscape(systemPrompt) # "\",\"messages\":[{\"role\":\"user\",\"content\":\"" # jsonEscape(userMessage) # "\"}]}";

    let resp = await (with cycles = CLAUDE_OUTCALL_CYCLES) IC.http_request({
      url                 = CLAUDE_API_URL;
      max_response_bytes  = ?CLAUDE_MAX_RESPONSE_BYTES;
      headers             = [
        { name = "x-api-key"; value = key },
        { name = "anthropic-version"; value = ANTHROPIC_VERSION },
        { name = "content-type"; value = "application/json" },
      ];
      body                = ?Text.encodeUtf8(bodyJson);
      method              = #post;
      transform           = ?{ function = transform; context = Blob.fromArray([]) };
      is_replicated       = null;
    });

    let bodyText = switch (Text.decodeUtf8(resp.body)) { case (?t) t; case null "" };

    if (resp.status != 200) {
      return #err("Claude API error " # Nat.toText(resp.status) # ": " # bodyText);
    };

    switch (extractClaudeText(bodyText)) {
      case (?t) #ok(t);
      case null #err("Couldn't parse the AI assistant's response");
    }
  };

  // Conversational rule Q&A. `context` is rulebook text the frontend has
  // already fetched from the content canister (this canister makes no
  // inter-canister calls, per the codebase-wide pattern) — e.g. the body of
  // the article the official is currently studying, if one is selected.
  // Chat history is intentionally never stored here: it lives only in the
  // frontend's in-memory session state, so it never persists across sessions.
  public shared ({ caller }) func askRuleAssistant(question : Text, context : Text) : async Result.Result<Text, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to ask the rule assistant");
    switch (checkAndConsume(caller)) {
      case (#err(e)) return #err(e);
      case (#ok()) {};
    };
    let sysPrompt = getTemplate("rule_assistant_system", DEFAULT_RULE_ASSISTANT_SYSTEM);
    let userMsg = (if (context == "") "" else "Rulebook context:\n" # context # "\n\n") # "Question: " # question;
    await callClaude(sysPrompt, userMsg, 700)
  };

  // On-demand personalized practice: the frontend derives the official's
  // weakest articles (already computed for ProgressPage/report cards) and
  // passes a short context blob describing them. Results are ephemeral —
  // shown as a one-off practice set in the frontend, never written to the
  // shared question bank, so they don't need admin review.
  public shared ({ caller }) func generatePersonalizedDrills(weakAreasContext : Text, count : Nat) : async Result.Result<Text, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to generate practice questions");
    if (count == 0 or count > 10) return #err("count must be between 1 and 10");
    switch (checkAndConsume(caller)) {
      case (#err(e)) return #err(e);
      case (#ok()) {};
    };
    let sysPrompt = getTemplate("scenario_generator_system", DEFAULT_SCENARIO_SYSTEM);
    let userMsg = "Generate exactly " # Nat.toText(count) # " novel practice questions focused on the rule sections this official struggles with most.\n\n" # weakAreasContext;
    await callClaude(sysPrompt, userMsg, 2500)
  };

  // Curated-bank generation: admin-only, since results are meant to be
  // reviewed and individually approved into question.addQuestion() before
  // any official ever sees them (not rate-limited against the end-user cap).
  public shared ({ caller }) func generateScenarios(instructions : Text, articleContext : Text, count : Nat) : async Result.Result<Text, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    if (count == 0 or count > 10) return #err("count must be between 1 and 10");
    let sysPrompt = getTemplate("scenario_generator_system", DEFAULT_SCENARIO_SYSTEM);
    let userMsg = "Generate exactly " # Nat.toText(count) # " questions.\nInstructions: " # instructions # "\n\nRulebook context:\n" # articleContext;
    await callClaude(sysPrompt, userMsg, 3000)
  };

  public query func metrics() : async { ok : Bool; aiConfigured : Bool } {
    { ok = true; aiConfigured = anthropicApiKey != null }
  };
}
