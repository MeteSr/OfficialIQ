/// Pro-tier rules (issue #71), shared by the user, ai_proxy and exam
/// canisters: who counts as Pro, what each tier gets, and how a Stripe
/// checkout or subscription maps to an entitlement. Pure functions, so the
/// rules are unit-tested (test/Billing.test.mo) without real outcalls.
import Json "Json";
import Text "mo:core/Text";

module {

  public type EntitlementSource = {
    #web : Text;          // Stripe subscription id
    #appStore;
    #playStore;
    #association : Text;  // association id
    #comp;                // granted by an admin
  };

  public type Entitlement = {
    tier      : { #pro };
    source    : EntitlementSource;
    expiresAt : Int;
    updatedAt : Int;
  };

  /// What a caller gets. #paywallOff: billing isn't switched on, so
  /// everyone keeps today's behaviour.
  public type Access = { #free; #pro; #paywallOff };

  let DAY_NS : Int = 86_400_000_000_000;
  let HOUR_NS : Int = 3_600_000_000_000;

  public let FREE_AI_PER_DAY : Nat = 3;
  public let PRO_AI_PER_DAY : Nat = 50;
  /// The cap before tiers existed, kept while the paywall is off.
  public let PAYWALL_OFF_AI_PER_DAY : Nat = 8;
  public let FREE_HISTORY_DAYS : Nat = 30;

  public func isProAt(ents : [Entitlement], now : Int) : Bool {
    for (e in ents.values()) { if (e.expiresAt > now) return true };
    false
  };

  public func access(paywallEnabled : Bool, ents : [Entitlement], now : Int) : Access {
    if (not paywallEnabled) #paywallOff else if (isProAt(ents, now)) #pro else #free
  };

  public func aiDailyLimit(a : Access) : Nat = switch a {
    case (#free) FREE_AI_PER_DAY;
    case (#pro) PRO_AI_PER_DAY;
    case (#paywallOff) PAYWALL_OFF_AI_PER_DAY;
  };

  /// Free officials see exams from the last FREE_HISTORY_DAYS; the rest stay
  /// stored, so upgrading shows them at once.
  public func examVisible(a : Access, startedAt : Int, now : Int) : Bool = switch a {
    case (#free) startedAt >= now - FREE_HISTORY_DAYS * DAY_NS;
    case (#pro or #paywallOff) true;
  };

  // ─── Stripe ────────────────────────────────────────────────────────────────

  /// A Stripe object id with the expected prefix and nothing that could
  /// change the URL it's put in.
  public func validStripeId(prefix : Text, id : Text) : Bool {
    if (not id.startsWith(#text prefix) or id.size() <= prefix.size() or id.size() > 255) return false;
    for (c in id.chars()) {
      if (not ((c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_')) return false;
    };
    true
  };

  /// The fields of a Checkout Session and a Subscription that the claim and
  /// renewal rules read; the outcall transform keeps only these.
  public let SESSION_FIELDS : [Text] = ["id", "client_reference_id", "status", "mode", "subscription"];
  public let SUBSCRIPTION_FIELDS : [Text] = ["id", "status", "current_period_end"];

  public type ClaimError = { #notYours; #notComplete; #notSubscription; #malformed };

  /// The subscription a Checkout Session (Stripe JSON) grants to `caller`
  /// (principal text), if it's theirs and paid for.
  public func claimCheck(sessionJson : Text, caller : Text) : { #ok : Text; #err : ClaimError } {
    let f = switch (Json.fields(sessionJson)) { case (?f) f; case null return #err(#malformed) };
    if (Json.getText(f, "client_reference_id") != ?caller) return #err(#notYours);
    if (Json.getText(f, "status") != ?"complete") return #err(#notComplete);
    if (Json.getText(f, "mode") != ?"subscription") return #err(#notSubscription);
    switch (Json.getText(f, "subscription")) {
      case (?sub) { if (validStripeId("sub_", sub)) #ok(sub) else #err(#notSubscription) };
      case null #err(#notSubscription);
    }
  };

  /// What a Subscription (Stripe JSON) means for its entitlement:
  /// #renew to its period end, #pending (payment being retried: keep the
  /// current expiry and look again), or #ended (lapses at the current
  /// expiry). null when unreadable.
  public type SubscriptionState = { #renew : Int; #pending; #ended };

  public func subscriptionState(subJson : Text) : ?SubscriptionState {
    let f = switch (Json.fields(subJson)) { case (?f) f; case null return null };
    let end = switch (Json.getInt(f, "current_period_end")) { case (?s) s * 1_000_000_000; case null return null };
    switch (Json.getText(f, "status")) {
      case (?"active" or ?"trialing") ?#renew(end);
      case (?"past_due" or ?"incomplete") ?#pending;
      case (?"canceled" or ?"unpaid" or ?"incomplete_expired" or ?"paused") ?#ended;
      case _ null;
    }
  };

  /// How long after expiry a web subscription is still re-checked, so a
  /// payment that succeeds on a late retry restores Pro.
  public let RENEWAL_GRACE_DAYS : Nat = 7;

  /// Whether the renewal timer should ask Stripe about `e` now: web
  /// subscriptions within a day of expiry (or expired less than the grace
  /// period ago), at most once an hour.
  public func needsRenewalCheck(e : Entitlement, lastChecked : ?Int, now : Int) : Bool {
    switch (e.source) { case (#web _) {}; case _ return false };
    if (e.expiresAt > now + DAY_NS) return false;
    if (e.expiresAt < now - RENEWAL_GRACE_DAYS * DAY_NS) return false;
    switch lastChecked { case (?t) t <= now - HOUR_NS; case null true }
  };
}
