import { test; suite; expect } "mo:test";
import CallLog "../backend/lib/CallLog";

let SEC : Int = 1_000_000_000;
let DAY : Int = 86_400 * SEC;
let NOW : Int = 1_800_000_000 * SEC;

suite("validateNote", func() {
  test("accepts a note", func() {
    expect.bool(CallLog.validateNote("Block/charge at the 3-point line, 2nd qtr") == null).isTrue();
  });
  test("rejects an empty or blank note", func() {
    expect.bool(CallLog.validateNote("") == ?#empty).isTrue();
    expect.bool(CallLog.validateNote("   ") == ?#empty).isTrue();
  });
  test("rejects a note over the limit", func() {
    var long = "";
    var i = 0;
    while (i <= CallLog.MAX_NOTE_CHARS) { long #= "x"; i += 1 };
    expect.bool(CallLog.validateNote(long) == ?#tooLong).isTrue();
  });
});

suite("canLog", func() {
  test("a game that has started, within the last 30 days", func() {
    expect.bool(CallLog.canLog(NOW - 2 * 3600 * SEC, NOW) == null).isTrue();
    expect.bool(CallLog.canLog(NOW - 30 * DAY, NOW) == null).isTrue();
  });
  test("not a game that hasn't happened yet", func() {
    expect.bool(CallLog.canLog(NOW + 60 * SEC, NOW) == ?#notYet).isTrue();
  });
  test("not one older than 30 days", func() {
    expect.bool(CallLog.canLog(NOW - 31 * DAY, NOW) == ?#tooOld).isTrue();
  });
});

suite("boostedDue", func() {
  test("an active boost makes a question overdue, ahead of unseen ones", func() {
    expect.bool(CallLog.boostedDue(NOW + 5 * DAY, ?(NOW + DAY), NOW) < NOW).isTrue();
    expect.bool(CallLog.boostedDue(NOW, ?(NOW + DAY), NOW) < NOW).isTrue();
  });
  test("keeps an already more overdue date", func() {
    expect.bool(CallLog.boostedDue(NOW - 60 * DAY, ?(NOW + DAY), NOW) == NOW - 60 * DAY).isTrue();
  });
  test("no boost, or an expired one, leaves the date alone", func() {
    expect.bool(CallLog.boostedDue(NOW + 5 * DAY, null, NOW) == NOW + 5 * DAY).isTrue();
    expect.bool(CallLog.boostedDue(NOW + 5 * DAY, ?(NOW - 1), NOW) == NOW + 5 * DAY).isTrue();
  });
});
