import { test; suite; expect } "mo:test";
import Training "../backend/lib/Training";

let SEC : Int = 1_000_000_000;
let DAY : Int = 86_400 * SEC;

suite("creditedSec", func() {
  test("sums answer time", func() {
    expect.nat(Training.creditedSec([10, 20, 30], 0, 600 * SEC)).equal(60);
  });
  test("never exceeds the time between start and finish", func() {
    expect.nat(Training.creditedSec([300, 300], 0, 90 * SEC)).equal(90);
  });
  test("is zero when finish is not after start", func() {
    expect.nat(Training.creditedSec([30], 50 * SEC, 10 * SEC)).equal(0);
  });
});

suite("beatCredit", func() {
  test("the first beat only starts the clock", func() {
    expect.nat(Training.beatCredit(null, 100 * SEC)).equal(0);
  });
  test("credits the gap since the last beat", func() {
    expect.nat(Training.beatCredit(?(100 * SEC), 160 * SEC)).equal(60);
  });
  test("credits a gap of exactly the maximum", func() {
    expect.nat(Training.beatCredit(?0, Training.STUDY_GAP_NS)).equal(120);
  });
  test("credits nothing after a longer gap", func() {
    expect.nat(Training.beatCredit(?0, Training.STUDY_GAP_NS + 1)).equal(0);
  });
  test("credits nothing for a clock that went backwards", func() {
    expect.nat(Training.beatCredit(?(100 * SEC), 50 * SEC)).equal(0);
  });
});

suite("addStudy", func() {
  test("starts a day", func() {
    let d = Training.addStudy([], 3 * DAY + 5, 60);
    expect.nat(d.size()).equal(1);
    expect.nat(d[0].day).equal(3);
    expect.nat(d[0].seconds).equal(60);
  });
  test("adds to today", func() {
    let d = Training.addStudy([{ day = 3; seconds = 60 }], 3 * DAY + 5, 30);
    expect.nat(d.size()).equal(1);
    expect.nat(d[0].seconds).equal(90);
  });
  test("caps a day", func() {
    let d = Training.addStudy([{ day = 3; seconds = Training.MAX_STUDY_SEC_PER_DAY - 10 }], 3 * DAY, 60);
    expect.nat(d[0].seconds).equal(Training.MAX_STUDY_SEC_PER_DAY);
  });
  test("drops days older than the retention window", func() {
    let today = Training.STUDY_KEEP_DAYS + 10;
    let d = Training.addStudy([{ day = 5; seconds = 60 }, { day = 10; seconds = 60 }], today * DAY, 30);
    expect.nat(d.size()).equal(2);
    expect.nat(d[0].day).equal(10);
    expect.nat(d[1].day).equal(today);
  });
  test("ignores zero seconds", func() {
    expect.nat(Training.addStudy([], 3 * DAY, 0).size()).equal(0);
  });
});

suite("validateRequirement", func() {
  test("accepts months 1-12 and sane hours", func() {
    expect.bool(Training.validateRequirement({ hoursPerSeason = 20; seasonStartMonth = 1 }) == null).isTrue();
    expect.bool(Training.validateRequirement({ hoursPerSeason = 1; seasonStartMonth = 12 }) == null).isTrue();
  });
  test("rejects a month outside 1-12", func() {
    expect.bool(Training.validateRequirement({ hoursPerSeason = 20; seasonStartMonth = 0 }) == ?#invalidSeasonStartMonth).isTrue();
    expect.bool(Training.validateRequirement({ hoursPerSeason = 20; seasonStartMonth = 13 }) == ?#invalidSeasonStartMonth).isTrue();
  });
  test("rejects zero or too many hours", func() {
    expect.bool(Training.validateRequirement({ hoursPerSeason = 0; seasonStartMonth = 8 }) == ?#invalidHours).isTrue();
    expect.bool(Training.validateRequirement({ hoursPerSeason = Training.MAX_HOURS_PER_SEASON + 1; seasonStartMonth = 8 }) == ?#invalidHours).isTrue();
  });
});
