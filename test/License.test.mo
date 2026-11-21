import { test; suite; expect } "mo:test";
import License "../backend/lib/License";
import Billing "../backend/lib/Billing";
import Principal "mo:core/Principal";
import Array "mo:core/Array";

let SEC : Int = 1_000_000_000;
let DAY : Int = 86_400 * SEC;
let NOW : Int = 1_800_000_000 * SEC;

let A = Principal.fromText("aaaaa-aa");
let B = Principal.fromText("2vxsx-fae");
let C = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
let D = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
let E = Principal.fromText("r7inp-6aaaa-aaaaa-aaabq-cai");

func lic(seats : Nat, source : License.Source, expiresAt : Int) : License.License = { seats; source; expiresAt; updatedAt = 0 };
func same(a : [Principal], b : [Principal]) : Bool = a.equal(b, Principal.equal);

suite("trial", func() {
  test("is 30 days and 25 seats", func() {
    let t = License.trial(NOW);
    expect.nat(t.seats).equal(25);
    expect.bool(t.expiresAt == NOW + 30 * DAY).isTrue();
    expect.bool(t.source == #trial).isTrue();
  });
});

suite("active and gate", func() {
  test("a license is active until it expires", func() {
    expect.bool(License.isActive(?lic(10, #manual, NOW + 1), NOW)).isTrue();
    expect.bool(License.isActive(?lic(10, #manual, NOW), NOW)).isFalse();
    expect.bool(License.isActive(null, NOW)).isFalse();
  });
  test("gated features are open while the paywall is off, and need an active license once it's on", func() {
    expect.bool(License.allowed(false, null, NOW)).isTrue();
    expect.bool(License.allowed(true, null, NOW)).isFalse();
    expect.bool(License.allowed(true, ?lic(10, #trial, NOW - 1), NOW)).isFalse();
    expect.bool(License.allowed(true, ?lic(10, #trial, NOW + DAY), NOW)).isTrue();
  });
});

suite("claim", func() {
  func session(ref : Text, status : Text, mode : Text) : Text =
    "{\"id\":\"cs_1\",\"client_reference_id\":\"" # ref # "\",\"status\":\"" # status # "\",\"mode\":\"" # mode # "\",\"subscription\":\"sub_9\"}";
  let mine = License.reference("asc3", "abc-def");

  test("the reference names the association and the coordinator", func() {
    expect.text(mine).equal("assoc_asc3_abc-def");
  });
  test("accepts the coordinator's own completed subscription checkout for that association", func() {
    expect.bool(License.claimCheck(session(mine, "complete", "subscription"), "asc3", "abc-def") == #ok("sub_9")).isTrue();
  });
  test("refuses another association's checkout", func() {
    expect.bool(License.claimCheck(session(mine, "complete", "subscription"), "asc4", "abc-def") == #err(#notYours)).isTrue();
  });
  test("refuses someone else's checkout", func() {
    expect.bool(License.claimCheck(session(mine, "complete", "subscription"), "asc3", "xyz-123") == #err(#notYours)).isTrue();
    // An official's own Pro checkout isn't a license.
    expect.bool(License.claimCheck(session("abc-def", "complete", "subscription"), "asc3", "abc-def") == #err(#notYours)).isTrue();
  });
  test("refuses an incomplete or one-off checkout", func() {
    expect.bool(License.claimCheck(session(mine, "open", "subscription"), "asc3", "abc-def") == #err(#notComplete)).isTrue();
    expect.bool(License.claimCheck(session(mine, "complete", "payment"), "asc3", "abc-def") == #err(#notSubscription)).isTrue();
  });
  test("needs at least 10 seats", func() {
    expect.bool(License.enoughSeats(9)).isFalse();
    expect.bool(License.enoughSeats(10)).isTrue();
    expect.nat(License.MIN_SEATS).equal(10);
  });
});

suite("subscription state", func() {
  func sub(status : Text, quantity : Text) : Text =
    "{\"id\":\"sub_9\",\"status\":\"" # status # "\",\"current_period_end\":1900000000,\"items\":{\"object\":\"list\",\"data\":[{\"id\":\"si_1\",\"quantity\":" # quantity # "}]}}";
  let END = 1_900_000_000 * SEC;

  test("an active subscription renews to its period end with its seat count", func() {
    expect.bool(License.subscriptionState(License.canonicalSubscription(sub("active", "12"))) == ?#renew({ until = END; seats = 12 })).isTrue();
    expect.bool(License.subscriptionState(License.canonicalSubscription(sub("trialing", "10"))) == ?#renew({ until = END; seats = 10 })).isTrue();
  });
  test("a quantity change shows up as the new seat count", func() {
    expect.bool(License.subscriptionState(License.canonicalSubscription(sub("active", "40"))) == ?#renew({ until = END; seats = 40 })).isTrue();
  });
  test("past_due is pending, canceled has ended", func() {
    expect.bool(License.subscriptionState(License.canonicalSubscription(sub("past_due", "12"))) == ?#pending).isTrue();
    expect.bool(License.subscriptionState(License.canonicalSubscription(sub("canceled", "12"))) == ?#ended).isTrue();
  });
  test("no readable quantity is unreadable", func() {
    expect.bool(License.subscriptionState(License.canonicalSubscription("{\"status\":\"active\",\"current_period_end\":1}")) == null).isTrue();
  });
  test("the canonical form keeps only what the rules read", func() {
    let raw = "{\"id\":\"sub_9\",\"customer\":\"cus_1\",\"created\":5,\"status\":\"active\",\"current_period_end\":1900000000,\"items\":{\"data\":[{\"id\":\"si_1\",\"quantity\":12,\"created\":7}]}}";
    expect.text(License.canonicalSubscription(raw)).equal("{\"id\":\"sub_9\",\"status\":\"active\",\"current_period_end\":1900000000,\"quantity\":12}");
  });
});

suite("seats", func() {
  test("go to members in join order up to the cap, skipping the coordinator", func() {
    // A is the coordinator and joined first.
    expect.bool(same(License.fillSeats([], [A, B, C, D], A, 2), [B, C])).isTrue();
    expect.bool(same(License.fillSeats([], [A, B], A, 5), [B])).isTrue();
    expect.bool(same(License.fillSeats([B, C], [A, B, C, D], A, 0), [])).isTrue();
  });
  test("keep current holders and fill free seats from the rest", func() {
    expect.bool(same(License.fillSeats([D], [A, B, C, D], A, 2), [D, B])).isTrue();
  });
  test("drop holders who left", func() {
    expect.bool(same(License.fillSeats([B, C], [A, C, D], A, 2), [C, D])).isTrue();
  });
  test("shrinking drops the newest holders first", func() {
    expect.bool(same(License.fillSeats([B, C, D, E], [A, B, C, D, E], A, 2), [B, C])).isTrue();
  });
  test("move from a holder to a member without a seat, keeping its place", func() {
    expect.bool(License.moveSeat([B, C], [A, B, C, D], B, D) == #ok([D, C])).isTrue();
    // The coordinator can take a seat too.
    expect.bool(License.moveSeat([B, C], [A, B, C, D], C, A) == #ok([B, A])).isTrue();
  });
  test("refuse a move from someone without a seat, or to a non-member or a holder", func() {
    expect.bool(License.moveSeat([B, C], [A, B, C, D], D, A) == #err(#noSeat)).isTrue();
    expect.bool(License.moveSeat([B, C], [A, B, C, D], B, E) == #err(#notMember)).isTrue();
    expect.bool(License.moveSeat([B, C], [A, B, C, D], B, C) == #err(#alreadyHasSeat)).isTrue();
  });
  test("a moved seat isn't taken back while the cap is full", func() {
    let moved = switch (License.moveSeat([B, C], [A, B, C, D], B, D)) { case (#ok(h)) h; case (#err(_)) [] };
    expect.bool(same(License.fillSeats(moved, [A, B, C, D], A, 2), [D, C])).isTrue();
  });
});

suite("renewal checks", func() {
  test("only Stripe licenses are checked", func() {
    expect.bool(License.needsCheck(lic(10, #manual, NOW + DAY / 2), null, NOW)).isFalse();
    expect.bool(License.needsCheck(lic(25, #trial, NOW + DAY / 2), null, NOW)).isFalse();
  });
  test("daily mid-period, so seat changes and cancellations land", func() {
    let l = lic(10, #stripe "sub_1", NOW + 100 * DAY);
    expect.bool(License.needsCheck(l, null, NOW)).isTrue();
    expect.bool(License.needsCheck(l, ?(NOW - DAY / 2), NOW)).isFalse();
    expect.bool(License.needsCheck(l, ?(NOW - DAY), NOW)).isTrue();
  });
  test("hourly near or just past expiry, and not after the grace period", func() {
    let near = lic(10, #stripe "sub_1", NOW + DAY / 2);
    expect.bool(License.needsCheck(near, ?(NOW - 2 * 3_600 * SEC), NOW)).isTrue();
    expect.bool(License.needsCheck(near, ?(NOW - 1_800 * SEC), NOW)).isFalse();
    let lapsed = lic(10, #stripe "sub_1", NOW - (Billing.RENEWAL_GRACE_DAYS + 1) * DAY);
    expect.bool(License.needsCheck(lapsed, null, NOW)).isFalse();
  });
  test("a lapse is cleaned up after the grace period", func() {
    expect.bool(License.lapsed(lic(10, #stripe "sub_1", NOW - DAY), NOW)).isFalse();
    expect.bool(License.lapsed(lic(10, #stripe "sub_1", NOW - (Billing.RENEWAL_GRACE_DAYS + 1) * DAY), NOW)).isTrue();
    expect.bool(License.lapsed(lic(10, #manual, NOW - (Billing.RENEWAL_GRACE_DAYS + 1) * DAY), NOW)).isTrue();
  });
});
