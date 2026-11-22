/// When a peer challenge expires (test/ChallengeExpiry.test.mo).
///
/// A challenge is open for TTL_NS after it's sent. One nobody finished in
/// that time reads as #Expired wherever the challenge canister hands it
/// out, even before a call stores the change, so an expired challenge
/// drops out of the inbox on time rather than when someone next touches it.
module {
  public type Status = { #Pending; #Accepted; #Completed; #Declined; #Expired };

  public let TTL_NS : Int = 259_200_000_000_000; // 72 hours

  /// The status as of `now`: an open (#Pending or #Accepted) challenge past
  /// `expiresAt` is #Expired; any other status stays as stored.
  public func status(stored : Status, expiresAt : Int, now : Int) : Status {
    switch stored {
      case (#Pending or #Accepted) { if (now > expiresAt) #Expired else stored };
      case _ stored;
    }
  };

  /// Whether a result can still be recorded.
  public func isOpen(stored : Status, expiresAt : Int, now : Int) : Bool {
    switch (status(stored, expiresAt, now)) {
      case (#Pending or #Accepted) true;
      case _ false;
    }
  };
};
