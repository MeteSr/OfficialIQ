/// How the user canister stores a profile, separate from the Profile type
/// its API returns (see backend/exam/Stored.mo for why and how to add a
/// version). main.mo converts in view() and fromRole().
module {

  public type RoleV1 = { #Official; #Assessor; #Admin; #Coordinator };

  public type ProfileV1 = {
    principal         : Principal;
    displayName       : Text;
    role              : RoleV1;
    sport             : Text;
    level             : Text;
    state             : Text;
    preferredLanguage : Text;
    createdAt         : Int;
  };

  /// The current stored version.
  public type Profile = ProfileV1;
  public type Role = RoleV1;
}
