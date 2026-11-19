import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

// Canister IDs of sibling canisters. `icp deploy` injects
// PUBLIC_CANISTER_ID:<name> into every canister's environment (icp.yaml).
module {
  public func canisterId<system>(name : Text) : ?Principal {
    let wanted = "PUBLIC_CANISTER_ID:" # name;
    // The name passed to Runtime.envVar is the one envVarNames returned, not
    // `wanted` itself: with moc 2.2.3, envVar on a concatenated Text traps
    // with "ic0.env_var_name_exists: Variable name is not a valid UTF-8
    // string" (found by the canister integration tests). Looking the name up
    // also makes a missing variable a plain null.
    for (n in Runtime.envVarNames<system>().values()) {
      if (n == wanted) {
        return switch (Runtime.envVar<system>(n)) {
          case (?t) ?Principal.fromText(t);
          case null null;
        };
      };
    };
    null
  };

  /// True when `caller` is the named sibling canister. False when that
  /// canister's id isn't configured, so a guard built on it fails closed.
  public func isCanister<system>(caller : Principal, name : Text) : Bool {
    switch (canisterId<system>(name)) { case (?id) id == caller; case null false }
  };
}
