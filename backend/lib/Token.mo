import Random "mo:core/Random";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Text "mo:core/Text";
import Char "mo:core/Char";

// Unguessable bearer tokens (share links, mentor links, join codes).
//
// Anything that grants access just by being known must come from the
// management canister's randomness (raw_rand), never from a counter: a
// sequential "tok0", "tok1", ... can be enumerated by anyone.
module {

  let HEX : [Char] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

  // Crockford-style alphabet without I, L, O, U — easy to read aloud and type.
  let CODE : [Char] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z',
  ];

  /// 128 random bits as 32 lowercase hex characters, with an optional prefix.
  public func hex(prefix : Text) : async Text {
    let bytes = Blob.toArray(await Random.blob());
    var out = prefix;
    var i = 0;
    while (i < 16) {
      let b = Nat8.toNat(bytes[i]);
      out := out # Char.toText(HEX[b / 16]) # Char.toText(HEX[b % 16]);
      i += 1;
    };
    out
  };

  /// `len` characters from a 32-symbol alphabet (5 bits each, len <= 32),
  /// for codes a person types in. 10 characters = 50 bits.
  public func code(len : Nat) : async Text {
    let bytes = Blob.toArray(await Random.blob());
    var out = "";
    var i = 0;
    while (i < len and i < bytes.size()) {
      out := out # Char.toText(CODE[Nat8.toNat(bytes[i]) % 32]);
      i += 1;
    };
    out
  };

  /// Normalises a typed join code: trims spaces and upper-cases it.
  public func normalizeCode(t : Text) : Text {
    Text.toUpper(Text.trim(t, #char ' '))
  };
}
