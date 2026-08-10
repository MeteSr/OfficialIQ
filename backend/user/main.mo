import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Result "mo:base/Result";

persistent actor User {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Role = {
    #Official;
    #Assessor;
    #Admin;
  };

  public type Profile = {
    principal : Principal;
    displayName : Text;
    role        : Role;
    sport       : Text;   // e.g. "ncaa_basketball"
    level       : Text;   // e.g. "varsity"
    createdAt   : Int;
  };

  public type ProfileUpdate = {
    displayName : Text;
    sport       : Text;
    level       : Text;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var profiles : HashMap.HashMap<Principal, Profile> =
    HashMap.HashMap<Principal, Profile>(64, Principal.equal, Principal.hash);

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (profiles.get(caller) != null) return #err("Profile already exists");

    let p : Profile = {
      principal   = caller;
      displayName = req.displayName;
      role        = #Official;
      sport       = req.sport;
      level       = req.level;
      createdAt   = Time.now();
    };
    profiles.put(caller, p);
    #ok(p)
  };

  public shared ({ caller }) func updateProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    switch (profiles.get(caller)) {
      case null { #err("Profile not found") };
      case (?existing) {
        let updated : Profile = {
          principal   = existing.principal;
          displayName = req.displayName;
          role        = existing.role;
          sport       = req.sport;
          level       = req.level;
          createdAt   = existing.createdAt;
        };
        profiles.put(caller, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyProfile() : async ?Profile {
    profiles.get(caller)
  };

  public query func getProfile(p : Principal) : async ?Profile {
    profiles.get(p)
  };

  // ─── Admin ────────────────────────────────────────────────────────────────

  public query func metrics() : async { userCount : Nat } {
    { userCount = profiles.size() }
  };
}
