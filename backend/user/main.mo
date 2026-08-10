import Principal "mo:core/Principal";
import Map "mo:core/Map";
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
    state       : Text;
    createdAt   : Int;
  };

  public type ProfileUpdate = {
    displayName : Text;
    sport       : Text;
    level       : Text;
    state       : Text;
  };

  // ─── State ────────────────────────────────────────────────────────────────

  var profiles : Map.Map<Principal, Profile> = Map.empty<Principal, Profile>();

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared ({ caller }) func createProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    if (Principal.isAnonymous(caller)) return #err("Must be authenticated");
    if (Map.get(profiles, Principal.compare, caller) != null) return #err("Profile already exists");

    let p : Profile = {
      principal   = caller;
      displayName = req.displayName;
      role        = #Official;
      sport       = req.sport;
      level       = req.level;
      state       = req.state;
      createdAt   = Time.now();
    };
    Map.add(profiles, Principal.compare, caller, p);
    #ok(p)
  };

  public shared ({ caller }) func updateProfile(req : ProfileUpdate) : async Result.Result<Profile, Text> {
    switch (Map.get(profiles, Principal.compare, caller)) {
      case null { #err("Profile not found") };
      case (?existing) {
        let updated : Profile = {
          principal   = existing.principal;
          displayName = req.displayName;
          role        = existing.role;
          sport       = req.sport;
          level       = req.level;
          state       = req.state;
          createdAt   = existing.createdAt;
        };
        Map.add(profiles, Principal.compare, caller, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public shared query ({ caller }) func getMyProfile() : async ?Profile {
    Map.get(profiles, Principal.compare, caller)
  };

  public query func getProfile(p : Principal) : async ?Profile {
    Map.get(profiles, Principal.compare, p)
  };

  public query func metrics() : async { userCount : Nat } {
    { userCount = Map.size(profiles) }
  };
}
