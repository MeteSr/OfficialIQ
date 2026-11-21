/// Association seat licenses (issue #78): an association's license, its
/// 30-day trial, what it unlocks while the paywall is on, how a Stripe
/// checkout or subscription maps to one, and who holds its seats. Pure
/// functions, unit-tested in test/License.test.mo; the association canister
/// keeps the state and makes the outcalls.
import Billing "Billing";
import Json "Json";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Int "mo:core/Int";
import Nat "mo:core/Nat";

module {

  public type Source = {
    #stripe : Text; // Stripe subscription id (sub_…)
    #trial;
    #manual; // granted by an admin: invoices, POs, test accounts
  };

  public type License = {
    seats     : Nat;
    source    : Source;
    expiresAt : Int;
    updatedAt : Int;
  };

  let DAY_NS : Int = 86_400_000_000_000;
  let HOUR_NS : Int = 3_600_000_000_000;

  /// Bought licenses start at 10 seats. Admin grants may go lower.
  public let MIN_SEATS : Nat = 10;
  public let TRIAL_DAYS : Nat = 30;
  public let TRIAL_SEATS : Nat = 25;

  public func trial(now : Int) : License =
    { seats = TRIAL_SEATS; source = #trial; expiresAt = now + TRIAL_DAYS * DAY_NS; updatedAt = now };

  public func isActive(l : ?License, now : Int) : Bool = switch l {
    case (?l) l.expiresAt > now;
    case null false;
  };

  /// Whether the licensed coordinator features (assignments, training
  /// requirements, transcripts, readiness) are open: always while the
  /// paywall is off, else only with an active license or trial.
  public func allowed(paywallOn : Bool, l : ?License, now : Int) : Bool =
    not paywallOn or isActive(l, now);

  // ─── Stripe ────────────────────────────────────────────────────────────────

  /// The Checkout Session's client_reference_id for a license bought by
  /// `coordinator` (principal text) for `associationId`. Only letters,
  /// digits, dashes and underscores, which Stripe accepts everywhere.
  public func reference(associationId : Text, coordinator : Text) : Text =
    "assoc_" # associationId # "_" # coordinator;

  /// The subscription a Checkout Session (Stripe JSON) buys for this
  /// association, if `coordinator` started it for this association and it's
  /// complete. The seat count comes from the subscription, never the client.
  public func claimCheck(sessionJson : Text, associationId : Text, coordinator : Text) : { #ok : Text; #err : Billing.ClaimError } =
    Billing.claimCheck(sessionJson, reference(associationId, coordinator));

  public func enoughSeats(seats : Nat) : Bool = seats >= MIN_SEATS;

  /// A Subscription reduced to what the rules read: Billing's fields plus
  /// the first item's quantity (the seat count) as "quantity". The outcall
  /// transform returns this, so every replica agrees on it.
  public func canonicalSubscription(raw : Text) : Text =
    Json.projectWithPaths(raw, Billing.SUBSCRIPTION_FIELDS, [("quantity", ["items", "data", "0", "quantity"])]);

  public type SubscriptionState = { #renew : { until : Int; seats : Nat }; #pending; #ended };

  /// What a canonical Subscription means for the license: renew to its
  /// period end with its seat count, #pending (payment being retried: keep
  /// the license as it is), or #ended (lapses at its current expiry). null
  /// when unreadable.
  public func subscriptionState(canonical : Text) : ?SubscriptionState {
    let f = switch (Json.fields(canonical)) { case (?f) f; case null return null };
    let seats = switch (Json.getInt(f, "quantity")) { case (?q) { if (q < 0) return null; q.toNat() }; case null return null };
    switch (Billing.subscriptionState(canonical)) {
      case (?#renew(until)) ?#renew({ until; seats });
      case (?#pending) ?#pending;
      case (?#ended) ?#ended;
      case null null;
    }
  };

  /// Whether the renewal timer should ask Stripe about `l` now. Daily
  /// mid-period, so seat changes and cancellations made in the customer
  /// portal land without a webhook; hourly within a day of expiry and
  /// during the grace period after it; never for trials and admin grants.
  public func needsCheck(l : License, lastChecked : ?Int, now : Int) : Bool {
    switch (l.source) { case (#stripe _) {}; case _ return false };
    if (l.expiresAt < now - Billing.RENEWAL_GRACE_DAYS * DAY_NS) return false;
    let every = if (l.expiresAt > now + DAY_NS) DAY_NS else HOUR_NS;
    switch lastChecked { case (?t) t <= now - every; case null true }
  };

  /// Past its grace period without renewing: its seats' entitlements go.
  public func lapsed(l : License, now : Int) : Bool =
    l.expiresAt < now - Billing.RENEWAL_GRACE_DAYS * DAY_NS;

  // ─── Seats ─────────────────────────────────────────────────────────────────

  func contains(ps : [Principal], p : Principal) : Bool = ps.find(func x = x == p) != null;

  /// Who holds the association's `seats` seats: current holders who are
  /// still members keep theirs (the newest lose theirs first when seats
  /// shrink), and free seats go to the other members in join order. The
  /// coordinator isn't seated automatically but can be moved into a seat.
  public func fillSeats(holders : [Principal], members : [Principal], coordinator : Principal, seats : Nat) : [Principal] {
    let out = List.empty<Principal>();
    for (h in holders.values()) {
      if (out.size() < seats and contains(members, h) and not contains(out.toArray(), h)) out.add(h);
    };
    for (m in members.values()) {
      if (out.size() < seats and m != coordinator and not contains(out.toArray(), m)) out.add(m);
    };
    out.toArray()
  };

  public type MoveError = { #noSeat; #notMember; #alreadyHasSeat };

  /// Moves `from`'s seat to `to`, a member without one. The seat keeps its
  /// place, so a later shrink treats it as the same seat.
  public func moveSeat(holders : [Principal], members : [Principal], from : Principal, to : Principal) : { #ok : [Principal]; #err : MoveError } {
    if (not contains(holders, from)) return #err(#noSeat);
    if (not contains(members, to)) return #err(#notMember);
    if (contains(holders, to)) return #err(#alreadyHasSeat);
    #ok(holders.map<Principal, Principal>(func h = if (h == from) to else h))
  };
}
