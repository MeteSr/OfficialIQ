import Principal "mo:core/Principal";
import HashMap "mo:base/HashMap";  // mo:core/Map migration pending – HashMap still compiles
import Text "mo:core/Text";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Iter "mo:core/Iter";

persistent actor User {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type Role = {
    #Official;
    #Assessor;
    #Admin;
  };

  public type Profile = {
    principal   : Principal;
    displayName : Text;
    role        : Role;
    sport       : Text;
    level       : Text;
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

  public query func metrics() : async { userCount : Nat } {
    { userCount = profiles.size() }
  };
}
