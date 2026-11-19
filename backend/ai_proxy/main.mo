import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";
import Error "mo:core/Error";
import Env "../lib/Env";
import Array "mo:core/Array";
import Timer "mo:core/Timer";
import Billing "../lib/Billing";

// HTTPS outcalls go through the `ic` mops package's builder, which selects
// pricing version 2 and computes + attaches the cycles itself (https-outcalls
// skill) — no hand-rolled cycle amounts.
import Call "mo:ic/Call";
import IC "mo:ic/Types";

persistent actor AiProxy {

  var adminPrincipal : ?Principal = null;

  public shared ({ caller }) func setAdmin(p : Principal) : async Result.Result<(), Text> {
    switch adminPrincipal {
      case null {
        // Bootstrap is controller-only, so nobody can claim admin on a freshly
        // deployed canister before its deployer does (canister-security skill).
        if (not Principal.isController(caller)) return #err("Only a canister controller can set the first admin");
        adminPrincipal := ?p;
        #ok(())
      };
      case (?a) { if (caller == a) { adminPrincipal := ?p; #ok(()) } else #err("Unauthorized") };
    }
  };

  func isAdmin(p : Principal) : Bool {
    switch adminPrincipal { case (?a) a == p; case null false }
  };

  public shared query ({ caller }) func isAdminCaller() : async Bool { isAdmin(caller) };

  // Both outcalls below are POSTs to paid, non-idempotent APIs (ElevenLabs,
  // Anthropic) whose responses differ on every call, so they run
  // non-replicated: one node sends the request. In the default replicated
  // mode every node of the subnet (13+) would hit the API — and bill it —
  // and the nodes could never agree on an LLM/TTS response, so consensus
  // would fail. No transform: in non-replicated mode it isn't needed for
  // consensus, and leaving it out reserves nothing for it.
  let OUTCALL_EXPECTED_ROUNDTRIP_MS : Nat64 = 30_000;

  // HTTPS outcall — used for ElevenLabs TTS audio generation.
  // Returns raw response body bytes; stored on-chain by the caller.
  // `maxBytes` caps headers + body of the raw response.
  public shared ({ caller }) func httpPost(
    url      : Text,
    headers  : [IC.HttpHeader],
    bodyJson : Text,
    maxBytes : Nat64,
  ) : async Result.Result<Blob, Text> {
    if (not isAdmin(caller)) return #err("Admin only");

    let resp = try {
      await Call.httpRequest(url)
        .withMethod(#post)
        .withHeaders(headers)
        .withBody(Text.encodeUtf8(bodyJson))
        .withMaxResponseBytes(maxBytes)
        .nonReplicated()
        .withExpectedRoundtripTimeMs(OUTCALL_EXPECTED_ROUNDTRIP_MS)
        .send()
    } catch (e) {
      return #err("Outcall failed: " # Error.message(e));
    };

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

  var anthropicApiKey : ?Text = null;
  var claudeModel : Text = "claude-sonnet-5";
  var promptTemplates : Map.Map<Text, Text> = Map.empty<Text, Text>();

  let DEFAULT_RULE_ASSISTANT_SYSTEM : Text = "You are an officiating rules assistant embedded in the OfficialIQ study app. Answer the official's question clearly and concisely in a few sentences. You MUST cite the specific rule, in the form 'Art. X, Sec. Y' (using the closest citation available in the rulebook context provided), in every answer. If the provided context doesn't cover the question, say so honestly instead of guessing at a citation.";

  let DEFAULT_SCENARIO_SYSTEM : Text = "You generate multiple-choice officiating exam questions for the OfficialIQ study app. Reply with ONLY a JSON array (no prose, no markdown fences) of objects shaped exactly as: {\"stem\": string, \"choices\": [{\"id\": string, \"text\": string}], \"correctId\": string, \"explanation\": string, \"citation\": string, \"difficulty\": \"Beginner\"|\"Intermediate\"|\"Advanced\"|\"Expert\"}. Each question must have exactly 4 choices with ids \"a\",\"b\",\"c\",\"d\", and correctId must match one of them. Ground every question in the supplied rulebook context and cite the specific article/section in the citation field.";

  // Server-side rate limit shared across all Claude-backed end-user actions
  // (rule assistant + personalized drills), per tier (issue #71): the
  // user canister says whether the caller is free or Pro, and
  // Billing.aiDailyLimit gives the cap. While the paywall is off everyone
  // gets the cap from before tiers (Billing.PAYWALL_OFF_AI_PER_DAY).
  let DAILY_LIMIT : Nat = 8; // unused since issue #71; kept for stable compatibility
  let DAY_NS : Int = 86_400_000_000_000;

  // A query can't read canister environment variables, so the user
  // canister's id is copied here by update calls and by a timer right after
  // install and each upgrade (as the exam canister does).
  var USER_ID : ?Principal = null;

  func refreshEnv<system>() {
    switch (Env.canisterId<system>("user")) { case (?id) USER_ID := ?id; case null {} };
  };

  transient let _envTimer : Timer.TimerId = Timer.setTimer<system>(#seconds 0, func() : async () { refreshEnv<system>() });

  type UserAccess = actor { accessFor : shared query Principal -> async Result.Result<Billing.Access, { #notSibling }> };

  // If the user canister can't say (not configured, or the call fails), the
  // caller gets the paywall-off cap: the global budget below still bounds
  // spend, and a Pro official isn't cut to the free cap by an outage.
  func accessOf(caller : Principal) : async* Billing.Access {
    let id = switch USER_ID { case (?id) id; case null return #paywallOff };
    try {
      switch (await (actor (id.toText()) : UserAccess).accessFor(caller)) { case (#ok(a)) a; case (#err(_)) #paywallOff }
    } catch (_) { #paywallOff }
  };

  type RateLimitEntry = { dayBucket : Int; count : Nat };
  var rateLimits : Map.Map<Principal, RateLimitEntry> = Map.empty<Principal, RateLimitEntry>();

  func usedToday(caller : Principal) : Nat {
    let today = Time.now() / DAY_NS;
    switch (Map.get(rateLimits, Principal.compare, caller)) {
      case (?e) { if (e.dayBucket == today) e.count else 0 };
      case null 0;
    }
  };

  // The per-principal cap alone doesn't bound spend: Internet Identity hands
  // out new principals for free, so a script can rotate through them. This
  // app-wide daily budget is the hard ceiling on Claude calls (and on the
  // cycles each outcall costs); admins can tune it with setGlobalDailyLimit.
  var globalDailyLimit : Nat = 500;
  var globalUsage : RateLimitEntry = { dayBucket = 0; count = 0 };

  // Inputs are capped so one call can't send an arbitrarily large (and
  // expensive) prompt. The frontend already sends at most ~3,000 characters
  // of article context.
  let MAX_QUESTION_CHARS : Nat = 2_000;
  let MAX_CONTEXT_CHARS : Nat = 6_000;

  // No await between the check and the count, so concurrent calls can't
  // both pass a cap that only one fits under.
  func checkAndConsume(caller : Principal, access : Billing.Access) : Result.Result<(), Text> {
    let today = Time.now() / DAY_NS;
    let count = usedToday(caller);
    let limit = Billing.aiDailyLimit(access);
    if (count >= limit) {
      return #err(switch access {
        case (#free) "Free daily limit reached (" # limit.toText() # "/day). Pro gets " # Billing.PRO_AI_PER_DAY.toText() # " a day, or try again tomorrow.";
        case (#pro or #paywallOff) "Daily question limit reached (" # limit.toText() # "/day). Try again tomorrow.";
      });
    };
    let globalCount = if (globalUsage.dayBucket == today) globalUsage.count else 0;
    if (globalCount >= globalDailyLimit) {
      return #err("The AI assistant is busy today. Try again tomorrow.");
    };
    globalUsage := { dayBucket = today; count = globalCount + 1 };
    Map.add(rateLimits, Principal.compare, caller, { dayBucket = today; count = count + 1 });
    #ok(())
  };

  public shared ({ caller }) func setGlobalDailyLimit(limit : Nat) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    globalDailyLimit := limit;
    #ok(())
  };

  public shared query ({ caller }) func getGlobalUsage() : async Result.Result<{ usedToday : Nat; limitPerDay : Nat }, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let today = Time.now() / DAY_NS;
    #ok({ usedToday = if (globalUsage.dayBucket == today) globalUsage.count else 0; limitPerDay = globalDailyLimit })
  };

  // The tier each caller had at their last AI request, for the plain query
  // below. Transient: it's only a hint for older clients.
  transient let lastAccess : Map.Map<Principal, Billing.Access> = Map.empty<Principal, Billing.Access>();

  /// Older clients' status call. A plain query can't ask the user canister,
  /// so the cap is the one from the caller's last request; the app uses
  /// getMyAiUsage instead.
  public shared query ({ caller }) func getMyRateLimitStatus() : async { used : Nat; limitPerDay : Nat; resetAt : Int } {
    let today = Time.now() / DAY_NS;
    let access = switch (lastAccess.get(Principal.compare, caller)) { case (?a) a; case null #paywallOff };
    { used = usedToday(caller); limitPerDay = Billing.aiDailyLimit(access); resetAt = (today + 1) * DAY_NS };
  };

  /// The caller's AI usage today and their cap, by tier (issue #71).
  public shared composite query ({ caller }) func getMyAiUsage() : async { used : Nat; limitPerDay : Nat; resetAt : Int; access : Billing.Access } {
    let today = Time.now() / DAY_NS;
    // Composite queries can't call the async* helper (M0187).
    let access : Billing.Access = switch USER_ID {
      case (?id) {
        try {
          switch (await (actor (id.toText()) : UserAccess).accessFor(caller)) { case (#ok(a)) a; case (#err(_)) #paywallOff }
        } catch (_) { #paywallOff }
      };
      case null #paywallOff;
    };
    { used = usedToday(caller); limitPerDay = Billing.aiDailyLimit(access); resetAt = (today + 1) * DAY_NS; access };
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
    for (b in bytes.values()) {
      if (b == (34 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 34 : Nat8) }        // "
      else if (b == (92 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 92 : Nat8) }   // \
      else if (b == (10 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 110 : Nat8) }  // \n
      else if (b == (13 : Nat8)) { List.add(out, 92 : Nat8); List.add(out, 114 : Nat8) }  // \r
      else if (b == (9 : Nat8))  { List.add(out, 92 : Nat8); List.add(out, 116 : Nat8) }  // \t
      else if (b < (32 : Nat8)) { /* drop other control bytes */ }
      else { List.add(out, b) };
    };
    switch (Text.decodeUtf8(Array.toBlob(List.sliceToArray<Nat8>(out, 0, List.size(out))))) {
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
        Text.decodeUtf8(Array.toBlob(List.sliceToArray<Nat8>(out, 0, List.size(out))));
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

    let resp = try {
      await Call.httpRequest(CLAUDE_API_URL)
        .withMethod(#post)
        .withHeader("x-api-key", key)
        .withHeader("anthropic-version", ANTHROPIC_VERSION)
        .withHeader("content-type", "application/json")
        .withBody(Text.encodeUtf8(bodyJson))
        .withMaxResponseBytes(CLAUDE_MAX_RESPONSE_BYTES)
        .nonReplicated()
        .withExpectedRoundtripTimeMs(OUTCALL_EXPECTED_ROUNDTRIP_MS)
        .send()
    } catch (e) {
      return #err("Couldn't reach the AI assistant: " # Error.message(e));
    };

    let bodyText = switch (Text.decodeUtf8(resp.body)) { case (?t) t; case null "" };

    // The upstream error body stays out of the reply: it is shown to end
    // users and can carry account details (org/workspace ids, rate-limit
    // state) that only an admin should see.
    if (resp.status != 200) {
      return #err("The AI assistant couldn't answer right now (HTTP " # Nat.toText(resp.status) # "). Please try again later.");
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
    if (Text.size(question) > MAX_QUESTION_CHARS) return #err("Question is too long");
    if (Text.size(context) > MAX_CONTEXT_CHARS) return #err("Rulebook context is too long");
    refreshEnv<system>();
    let access = await* accessOf(caller);
    lastAccess.add(Principal.compare, caller, access);
    switch (checkAndConsume(caller, access)) {
      case (#err(e)) return #err(e);
      case (#ok()) {};
    };
    let sysPrompt = getTemplate("rule_assistant_system", DEFAULT_RULE_ASSISTANT_SYSTEM);
    let userMsg = (if (context == "") "" else "Rulebook context:\n" # context # "\n\n") # "Question: " # question;
    await callClaude(sysPrompt, userMsg, 700)
  };

  // Post-game call log (issue #66): matches an official's note about a call
  // to one of the rules the app sends (articles and casebook plays it has
  // already loaded, one per line as "id | citation | title"). The reply is
  // JSON naming one candidate id; the app checks it against the list and
  // shows it for the official to accept or change. Counts against the same
  // daily cap as the rule assistant.
  transient let DEFAULT_CALL_MATCHER_SYSTEM : Text = "You match an officiating call an official was unsure about to the rule that governs it. You are given the official's note and a list of candidate rules, one per line as 'id | citation | title'. Reply with ONLY a JSON object, no prose and no markdown fences: {\"id\": <the id of the single best candidate, copied exactly>, \"reason\": <one sentence on why that rule applies>}. Choose only from the candidates. If none applies, reply {\"id\": null, \"reason\": <one sentence>}.";
  transient let MAX_CALL_NOTE_CHARS : Nat = 1_000;

  public shared ({ caller }) func suggestRuleForCall(note : Text, candidates : Text) : async Result.Result<Text, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to match calls to rules");
    if (note.trim(#char ' ').size() == 0) return #err("Write a note about the call first");
    if (note.size() > MAX_CALL_NOTE_CHARS) return #err("Note is too long");
    if (candidates.size() == 0 or candidates.size() > MAX_CONTEXT_CHARS) return #err("Rule list is empty or too long");
    refreshEnv<system>();
    let access = await* accessOf(caller);
    lastAccess.add(Principal.compare, caller, access);
    switch (checkAndConsume(caller, access)) {
      case (#err(e)) return #err(e);
      case (#ok()) {};
    };
    let sysPrompt = getTemplate("call_matcher_system", DEFAULT_CALL_MATCHER_SYSTEM);
    let userMsg = "Call note: " # note # "\n\nCandidate rules:\n" # candidates;
    await callClaude(sysPrompt, userMsg, 300)
  };

  // On-demand personalized practice: the frontend derives the official's
  // weakest articles (already computed for ProgressPage/report cards) and
  // passes a short context blob describing them. Results are ephemeral —
  // shown as a one-off practice set in the frontend, never written to the
  // shared question bank, so they don't need admin review.
  public shared ({ caller }) func generatePersonalizedDrills(weakAreasContext : Text, count : Nat) : async Result.Result<Text, Text> {
    if (Principal.isAnonymous(caller)) return #err("Sign in to generate practice questions");
    if (Text.size(weakAreasContext) > MAX_CONTEXT_CHARS) return #err("Context is too long");
    if (count == 0 or count > 10) return #err("count must be between 1 and 10");
    refreshEnv<system>();
    let access = await* accessOf(caller);
    lastAccess.add(Principal.compare, caller, access);
    switch (checkAndConsume(caller, access)) {
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

  /// Called by the user canister when an official deletes their account:
  /// drops their daily usage counter. Safe to repeat.
  public shared ({ caller }) func forgetUser(p : Principal) : async Result.Result<(), Text> {
    if (not Env.isCanister<system>(caller, "user")) return #err("User canister only");
    Map.remove(rateLimits, Principal.compare, p);
    #ok(())
  };

  public query func metrics() : async { ok : Bool; aiConfigured : Bool } {
    { ok = true; aiConfigured = anthropicApiKey != null }
  };
}
