import { test; suite; expect } "mo:test";
import ChallengeExpiry "../backend/lib/ChallengeExpiry";

// Manual test plan case 12: a challenge left unanswered stays open, then
// expires 72 hours after it was sent. The browser tests can't wait 72
// hours, so the rule is tested here; the challenge canister applies it to
// everything it hands out.

let HOUR : Int = 3_600_000_000_000;
let sent : Int = 1_000 * HOUR;
let expiresAt : Int = sent + ChallengeExpiry.TTL_NS;

suite("ChallengeExpiry", func() {
  test("a challenge lasts 72 hours", func() {
    expect.int(ChallengeExpiry.TTL_NS).equal(72 * HOUR);
  });

  test("an unanswered challenge stays open until it expires", func() {
    expect.bool(ChallengeExpiry.status(#Pending, expiresAt, sent) == #Pending).isTrue();
    expect.bool(ChallengeExpiry.status(#Pending, expiresAt, sent + 71 * HOUR) == #Pending).isTrue();
    expect.bool(ChallengeExpiry.status(#Pending, expiresAt, expiresAt) == #Pending).isTrue();
  });

  test("an unanswered challenge reads as expired once 72 hours have passed", func() {
    expect.bool(ChallengeExpiry.status(#Pending, expiresAt, expiresAt + 1) == #Expired).isTrue();
    expect.bool(ChallengeExpiry.status(#Pending, expiresAt, sent + 100 * HOUR) == #Expired).isTrue();
  });

  test("an accepted challenge nobody finished expires too", func() {
    expect.bool(ChallengeExpiry.status(#Accepted, expiresAt, expiresAt + 1) == #Expired).isTrue();
  });

  test("a finished or declined challenge keeps its status", func() {
    expect.bool(ChallengeExpiry.status(#Completed, expiresAt, expiresAt + HOUR) == #Completed).isTrue();
    expect.bool(ChallengeExpiry.status(#Declined, expiresAt, expiresAt + HOUR) == #Declined).isTrue();
    expect.bool(ChallengeExpiry.status(#Expired, expiresAt, sent) == #Expired).isTrue();
  });

  test("isOpen is false once expired", func() {
    expect.bool(ChallengeExpiry.isOpen(#Pending, expiresAt, sent)).isTrue();
    expect.bool(ChallengeExpiry.isOpen(#Accepted, expiresAt, sent)).isTrue();
    expect.bool(ChallengeExpiry.isOpen(#Pending, expiresAt, expiresAt + 1)).isFalse();
    expect.bool(ChallengeExpiry.isOpen(#Completed, expiresAt, sent)).isFalse();
  });
});
