import { test; suite; expect } "mo:test";
import Billing "../backend/lib/Billing";

let SEC : Int = 1_000_000_000;
let DAY : Int = 86_400 * SEC;
let NOW : Int = 1_800_000_000 * SEC;

func ent(source : Billing.EntitlementSource, expiresAt : Int) : Billing.Entitlement =
  { tier = #pro; source; expiresAt; updatedAt = 0 };

suite("access", func() {
  test("everyone is unrestricted while the paywall is off", func() {
    expect.bool(Billing.access(false, [], NOW) == #paywallOff).isTrue();
  });
  test("no entitlement is free", func() {
    expect.bool(Billing.access(true, [], NOW) == #free).isTrue();
  });
  test("any unexpired entitlement is Pro", func() {
    expect.bool(Billing.access(true, [ent(#comp, NOW - DAY), ent(#web "sub_1", NOW + DAY)], NOW) == #pro).isTrue();
  });
  test("expired entitlements are free", func() {
    expect.bool(Billing.access(true, [ent(#comp, NOW - 1), ent(#appStore, NOW)], NOW) == #free).isTrue();
  });
});

suite("limits", func() {
  test("AI per day by access", func() {
    expect.nat(Billing.aiDailyLimit(#free)).equal(3);
    expect.nat(Billing.aiDailyLimit(#pro)).equal(50);
    expect.nat(Billing.aiDailyLimit(#paywallOff)).equal(8);
  });
  test("free sees the last 30 days of exams, others everything kept", func() {
    expect.bool(Billing.examVisible(#free, NOW - 29 * DAY, NOW)).isTrue();
    expect.bool(Billing.examVisible(#free, NOW - 31 * DAY, NOW)).isFalse();
    expect.bool(Billing.examVisible(#pro, NOW - 300 * DAY, NOW)).isTrue();
    expect.bool(Billing.examVisible(#paywallOff, NOW - 300 * DAY, NOW)).isTrue();
  });
});

suite("Stripe ids", func() {
  test("accepts well-formed ids", func() {
    expect.bool(Billing.validStripeId("cs_", "cs_test_a1B2c3")).isTrue();
    expect.bool(Billing.validStripeId("sub_", "sub_1PqRsT")).isTrue();
  });
  test("rejects anything that could change the URL", func() {
    expect.bool(Billing.validStripeId("cs_", "cs_test_../../v1/charges")).isFalse();
    expect.bool(Billing.validStripeId("cs_", "cs_a?expand[]=x")).isFalse();
    expect.bool(Billing.validStripeId("cs_", "sub_123")).isFalse();
    expect.bool(Billing.validStripeId("cs_", "cs_")).isFalse();
  });
});

suite("claim", func() {
  let me = "abcde-fgh";
  func session(ref : Text, status : Text, mode : Text, sub : Text) : Text =
    "{\"id\":\"cs_test_1\",\"client_reference_id\":" # ref # ",\"status\":" # status # ",\"mode\":" # mode # ",\"subscription\":" # sub # "}";

  test("a complete subscription checkout of mine gives its subscription id", func() {
    expect.bool(Billing.claimCheck(session("\"abcde-fgh\"", "\"complete\"", "\"subscription\"", "\"sub_9\""), me) == #ok("sub_9")).isTrue();
  });
  test("someone else's checkout is refused", func() {
    expect.bool(Billing.claimCheck(session("\"zzzzz-zzz\"", "\"complete\"", "\"subscription\"", "\"sub_9\""), me) == #err(#notYours)).isTrue();
    expect.bool(Billing.claimCheck(session("null", "\"complete\"", "\"subscription\"", "\"sub_9\""), me) == #err(#notYours)).isTrue();
  });
  test("an unpaid or abandoned checkout is refused", func() {
    expect.bool(Billing.claimCheck(session("\"abcde-fgh\"", "\"open\"", "\"subscription\"", "\"sub_9\""), me) == #err(#notComplete)).isTrue();
    expect.bool(Billing.claimCheck(session("\"abcde-fgh\"", "\"expired\"", "\"subscription\"", "\"sub_9\""), me) == #err(#notComplete)).isTrue();
  });
  test("a one-off payment or a missing subscription is refused", func() {
    expect.bool(Billing.claimCheck(session("\"abcde-fgh\"", "\"complete\"", "\"payment\"", "null"), me) == #err(#notSubscription)).isTrue();
    expect.bool(Billing.claimCheck(session("\"abcde-fgh\"", "\"complete\"", "\"subscription\"", "null"), me) == #err(#notSubscription)).isTrue();
  });
  test("an unreadable response is refused", func() {
    expect.bool(Billing.claimCheck("<html>", me) == #err(#malformed)).isTrue();
  });
});

suite("subscription state", func() {
  func sub(status : Text, end : Text) : Text = "{\"id\":\"sub_9\",\"status\":\"" # status # "\",\"current_period_end\":" # end # "}";

  test("active and trialing renew to the period end", func() {
    expect.bool(Billing.subscriptionState(sub("active", "1800086400")) == ?#renew(1_800_086_400 * SEC)).isTrue();
    expect.bool(Billing.subscriptionState(sub("trialing", "1800086400")) == ?#renew(1_800_086_400 * SEC)).isTrue();
  });
  test("past_due and incomplete wait: no extension, checked again", func() {
    expect.bool(Billing.subscriptionState(sub("past_due", "1800086400")) == ?#pending).isTrue();
    expect.bool(Billing.subscriptionState(sub("incomplete", "1800086400")) == ?#pending).isTrue();
  });
  test("canceled, unpaid, expired and paused end: lapse at the current expiry", func() {
    for (s in ["canceled", "unpaid", "incomplete_expired", "paused"].values()) {
      expect.bool(Billing.subscriptionState(sub(s, "1800086400")) == ?#ended).isTrue();
    };
  });
  test("an unknown status or missing period end is unreadable", func() {
    expect.bool(Billing.subscriptionState(sub("weird", "1800086400")) == null).isTrue();
    expect.bool(Billing.subscriptionState("{\"status\":\"active\"}") == null).isTrue();
  });
});

suite("renewal checks", func() {
  test("a web subscription is checked within a day of expiry, at most hourly", func() {
    let e = ent(#web "sub_9", NOW + 12 * 3600 * SEC);
    expect.bool(Billing.needsRenewalCheck(e, null, NOW)).isTrue();
    expect.bool(Billing.needsRenewalCheck(e, ?(NOW - 30 * 60 * SEC), NOW)).isFalse();
    expect.bool(Billing.needsRenewalCheck(e, ?(NOW - 2 * 3600 * SEC), NOW)).isTrue();
  });
  test("not while expiry is further off", func() {
    expect.bool(Billing.needsRenewalCheck(ent(#web "sub_9", NOW + 3 * DAY), null, NOW)).isFalse();
  });
  test("keeps checking a lapsed one for the grace period, then stops", func() {
    expect.bool(Billing.needsRenewalCheck(ent(#web "sub_9", NOW - 3 * DAY), null, NOW)).isTrue();
    expect.bool(Billing.needsRenewalCheck(ent(#web "sub_9", NOW - 8 * DAY), null, NOW)).isFalse();
  });
  test("only web subscriptions", func() {
    expect.bool(Billing.needsRenewalCheck(ent(#comp, NOW + 3600 * SEC), null, NOW)).isFalse();
  });
});
