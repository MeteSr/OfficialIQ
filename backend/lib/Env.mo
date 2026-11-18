import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

// Canister IDs of sibling canisters. `icp deploy` injects
// PUBLIC_CANISTER_ID:<name> into every canister's environment (icp.yaml).
module {
  public func canisterId<system>(name : Text) : ?Principal {
    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:" # name)) {
      case (?t) ?Principal.fromText(t);
      case null null;
    }
  };
}
