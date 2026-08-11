import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

persistent actor Report {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ArticleStat = { articleId : Text; title : Text; masteryScore : Nat };

  // A point-in-time snapshot, not a live-updating view — the numbers are
  // computed client-side (from ranking/user/content data already available
  // there) and frozen here at generation time, matching the issue's
  // "report cards are point-in-time snapshots" requirement.
  public type ReportSnapshot = {
    id                  : Text;
    owner               : Principal;
    displayName         : Text;
    sport               : Text;
    state               : Text;
    generatedAt         : Int;
    monthsActive        : Nat;
    examsCompleted      : Nat;
    avgScore            : Nat; // 0-100
    accuracyTrend       : Text; // e.g. "+5%", "-3%", "steady" — precomputed client-side
    topStrongest        : [ArticleStat];
    topWeakest          : [ArticleStat];
    studyHoursEstimated : Nat;
    isPublic            : Bool;
  };

  public type SnapshotInput = {
    displayName         : Text;
    sport               : Text;
    state               : Text;
    monthsActive        : Nat;
    examsCompleted      : Nat;
    avgScore            : Nat;
    accuracyTrend       : Text;
    topStrongest        : [ArticleStat];
    topWeakest          : [ArticleStat];
    studyHoursEstimated : Nat;
  };

  public type ReportShare = {
    id          : Text;
    reportId    : Text;
    coordinator : Principal;
    sharedAt    : Int;
    seen        : Bool;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var reports     : Map.Map<Text, ReportSnapshot> = Map.empty<Text, ReportSnapshot>();
  var myReportIds : Map.Map<Principal, [Text]>    = Map.empty<Principal, [Text]>();
  var shares      : Map.Map<Text, ReportShare>    = Map.empty<Text, ReportShare>();

  var nextReportId : Nat = 0;
  var nextShareId  : Nat = 0;

  func isSharedWith(reportId : Text, coordinator : Principal) : Bool {
    for ((_, s) in Map.entries(shares)) {
      if (s.reportId == reportId and s.coordinator == coordinator) return true;
    };
    false
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func generateReport(input : SnapshotInput) : async Result.Result<ReportSnapshot, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    let id = "rpt" # Nat.toText(nextReportId);
    nextReportId += 1;
    let r : ReportSnapshot = {
      id; owner = caller;
      displayName = input.displayName; sport = input.sport; state = input.state;
      generatedAt = Time.now();
      monthsActive = input.monthsActive; examsCompleted = input.examsCompleted;
      avgScore = input.avgScore; accuracyTrend = input.accuracyTrend;
      topStrongest = input.topStrongest; topWeakest = input.topWeakest;
      studyHoursEstimated = input.studyHoursEstimated;
      isPublic = false;
    };
    Map.add(reports, Text.compare, id, r);
    let mine = switch (Map.get(myReportIds, Principal.compare, caller)) { case (?xs) xs; case null [] };
    Map.add(myReportIds, Principal.compare, caller, Array.concat<Text>(mine, [id]));
    #ok(r)
  };

  public shared ({ caller }) func setPublic(id : Text, isPublic : Bool) : async Result.Result<ReportSnapshot, Text> {
    switch (Map.get(reports, Text.compare, id)) {
      case null #err("Report not found");
      case (?r) {
        if (r.owner != caller) return #err("Not your report");
        let updated = { r with isPublic };
        Map.add(reports, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared ({ caller }) func shareWithCoordinator(reportId : Text, coordinator : Principal) : async Result.Result<ReportShare, Text> {
    switch (Map.get(reports, Text.compare, reportId)) {
      case null #err("Report not found");
      case (?r) {
        if (r.owner != caller) return #err("Not your report");
        let id = "shr" # Nat.toText(nextShareId);
        nextShareId += 1;
        let s : ReportShare = { id; reportId; coordinator; sharedAt = Time.now(); seen = false };
        Map.add(shares, Text.compare, id, s);
        #ok(s)
      };
    }
  };

  public shared ({ caller }) func markShareSeen(id : Text) : async Result.Result<(), Text> {
    switch (Map.get(shares, Text.compare, id)) {
      case null #err("Share not found");
      case (?s) {
        if (s.coordinator != caller) return #err("Not your notification");
        Map.add(shares, Text.compare, id, { s with seen = true });
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  // No auth required by design — public report cards must load for
  // unauthenticated viewers (assignors clicking a shared link). Access is
  // granted if the report is public, the caller owns it, or it was shared
  // directly with the caller as a coordinator.
  public shared query ({ caller }) func getReport(id : Text) : async ?ReportSnapshot {
    switch (Map.get(reports, Text.compare, id)) {
      case null null;
      case (?r) {
        if (r.isPublic or r.owner == caller or isSharedWith(id, caller)) ?r else null
      };
    }
  };

  public shared query ({ caller }) func getMyReports() : async [ReportSnapshot] {
    let ids = switch (Map.get(myReportIds, Principal.compare, caller)) { case (?xs) xs; case null [] };
    let buf = List.empty<ReportSnapshot>();
    for (id in ids.vals()) {
      switch (Map.get(reports, Text.compare, id)) { case (?r) List.add(buf, r); case null {} };
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getSharedWithMe() : async [ReportShare] {
    let buf = List.empty<ReportShare>();
    for ((_, s) in Map.entries(shares)) {
      if (s.coordinator == caller) List.add(buf, s);
    };
    List.toArray(buf)
  };

  public shared query ({ caller }) func getMyUnseenShareCount() : async Nat {
    var count = 0;
    for ((_, s) in Map.entries(shares)) {
      if (s.coordinator == caller and not s.seen) count += 1;
    };
    count
  };

  public query func metrics() : async { reportCount : Nat; shareCount : Nat } {
    { reportCount = Map.size(reports); shareCount = Map.size(shares) }
  };
}
