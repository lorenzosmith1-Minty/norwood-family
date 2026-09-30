import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Random "mo:core/Random";

/// Secure randomness and cryptographic digest facility for onboarding tokens.
///
/// This module is the single approved source of invite-token entropy and token
/// digests. It never derives security from caller principal, invitation id,
/// timestamp, familyId, personId, or email.
///
/// - `generateToken` draws 256 bits (32 bytes) from the IC management canister
///   `raw_rand` via `mo:core/Random.blob` and encodes them URL-safe.
/// - `digestToken` returns the SHA-256 digest of the raw token's UTF-8 bytes,
///   rendered as lowercase hex. Only this digest is persisted; the raw token is
///   returned once and never logged.
module {
  /// The number of random bytes drawn per token: 32 bytes = 256 bits of
  /// unpredictable entropy.
  public let TOKEN_ENTROPY_BYTES : Nat = 32;

  /// Generates a fresh invite token from IC secure randomness.
  ///
  /// Draws `TOKEN_ENTROPY_BYTES` bytes from the management canister `raw_rand`
  /// and encodes them with URL-safe base64 (no padding). The result is
  /// unpredictable and independent of any caller-supplied or record-derived
  /// value.
  public func generateToken() : async Text {
    let entropy = await Random.blob();
    let bytes = entropy.toArray();
    // `raw_rand` returns 32 bytes; take exactly the first TOKEN_ENTROPY_BYTES so
    // the token always carries the full 256 bits even if the source grows.
    let bounded = if (bytes.size() >= TOKEN_ENTROPY_BYTES) {
      bytes.sliceToArray(0, TOKEN_ENTROPY_BYTES.toInt());
    } else {
      bytes;
    };
    base64UrlEncode(bounded);
  };

  /// The SHA-256 digest of `rawToken`'s UTF-8 bytes, rendered as 64 lowercase
  /// hex characters. This is the only persisted form of a token; validation
  /// compares this digest.
  public func digestToken(rawToken : Text) : Text {
    toHex(sha256(rawToken.encodeUtf8()).toArray());
  };

  /// URL-safe base64 (RFC 4648 §5) without padding: `+` -> `-`, `/` -> `_`.
  func base64UrlEncode(bytes : [Nat8]) : Text {
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let chars = alphabet.toArray();
    var out = "";
    var i = 0;
    let n = bytes.size();
    while (i + 2 < n) {
      let b0 = bytes[i].toNat();
      let b1 = bytes[i + 1].toNat();
      let b2 = bytes[i + 2].toNat();
      out := out # chars[b0 / 4].toText();
      out := out # chars[(b0 % 4) * 16 + b1 / 16].toText();
      out := out # chars[(b1 % 16) * 4 + b2 / 64].toText();
      out := out # chars[b2 % 64].toText();
      i += 3;
    };
    let remaining = n % 3;
    if (remaining == 1) {
      let b0 = bytes[i].toNat();
      out := out # chars[b0 / 4].toText();
      out := out # chars[(b0 % 4) * 16].toText();
    } else if (remaining == 2) {
      let b0 = bytes[i].toNat();
      let b1 = bytes[i + 1].toNat();
      out := out # chars[b0 / 4].toText();
      out := out # chars[(b0 % 4) * 16 + b1 / 16].toText();
      out := out # chars[(b1 % 16) * 4].toText();
    };
    out;
  };

  /// Renders a byte array as lowercase hex.
  func toHex(bytes : [Nat8]) : Text {
    let digits = "0123456789abcdef";
    let chars = digits.toArray();
    var out = "";
    for (byte in bytes.values()) {
      let value = byte.toNat();
      out := out # chars[value / 16].toText() # chars[value % 16].toText();
    };
    out;
  };

  // ---------------------------------------------------------------------------
  // SHA-256 (FIPS 180-4). Pure Motoko, no external dependency.
  // ---------------------------------------------------------------------------

  let K : [Nat32] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  /// The SHA-256 digest of `message`.
  public func sha256(message : Blob) : Blob {
    let bytes = message.toArray();
    let bitLen : Nat = bytes.size() * 8;
    // Padded message: message || 0x80 || zeros || 64-bit big-endian length.
    let padded = paddedMessage(bytes, bitLen);
    var h0 : Nat32 = 0x6a09e667;
    var h1 : Nat32 = 0xbb67ae85;
    var h2 : Nat32 = 0x3c6ef372;
    var h3 : Nat32 = 0xa54ff53a;
    var h4 : Nat32 = 0x510e527f;
    var h5 : Nat32 = 0x9b05688c;
    var h6 : Nat32 = 0x1f83d9ab;
    var h7 : Nat32 = 0x5be0cd19;
    var offset = 0;
    while (offset < padded.size()) {
      let w = messageSchedule(padded, offset);
      var a = h0;
      var b = h1;
      var c = h2;
      var d = h3;
      var e = h4;
      var f = h5;
      var g = h6;
      var h = h7;
      var t = 0;
      while (t < 64) {
        let s1 = Nat32.bitxor(Nat32.bitxor(rotr(e, 6), rotr(e, 11)), rotr(e, 25));
        let ch = Nat32.bitxor(Nat32.bitand(e, f), Nat32.bitand(Nat32.bitnot(e), g));
        let temp1 = h +% s1 +% ch +% K[t] +% w[t];
        let s0 = Nat32.bitxor(Nat32.bitxor(rotr(a, 2), rotr(a, 13)), rotr(a, 22));
        let maj = Nat32.bitxor(Nat32.bitxor(Nat32.bitand(a, b), Nat32.bitand(a, c)), Nat32.bitand(b, c));
        let temp2 = s0 +% maj;
        h := g;
        g := f;
        f := e;
        e := d +% temp1;
        d := c;
        c := b;
        b := a;
        a := temp1 +% temp2;
        t += 1;
      };
      h0 +%= a;
      h1 +%= b;
      h2 +%= c;
      h3 +%= d;
      h4 +%= e;
      h5 +%= f;
      h6 +%= g;
      h7 +%= h;
      offset += 64;
    };
    let digest = [h0, h1, h2, h3, h4, h5, h6, h7];
    var out : [Nat8] = [];
    for (word in digest.values()) {
      out := out.concat(wordToBytes(word));
    };
    out.toBlob();
  };

  /// Builds the padded message: append 0x80, zero-pad to 56 mod 64, then the
  /// 64-bit big-endian bit length.
  func paddedMessage(bytes : [Nat8], bitLen : Nat) : [Nat8] {
    var out : [Nat8] = bytes.concat([0x80 : Nat8]);
    while (out.size() % 64 != 56) {
      out := out.concat([0x00 : Nat8]);
    };
    // 64-bit big-endian length. Motoko `Nat` is unbounded; emit the low 64 bits.
    var shift : Int = 56;
    while (shift >= 0) {
      let byte = (bitLen / pow2(shift.toNat())) % 256;
      out := out.concat([byte.toNat8()]);
      shift -= 8;
    };
    out;
  };

  /// The 64-word message schedule for the block starting at `offset`.
  func messageSchedule(padded : [Nat8], offset : Nat) : [Nat32] {
    var w : [Nat32] = [];
    var i = 0;
    while (i < 16) {
      let base = offset + i * 4;
      let word = (
        padded[base].toNat() * 16_777_216 +
        padded[base + 1].toNat() * 65_536 +
        padded[base + 2].toNat() * 256 +
        padded[base + 3].toNat()
      ).toNat32();
      w := w.concat([word]);
      i += 1;
    };
    while (i < 64) {
      let s0 = Nat32.bitxor(Nat32.bitxor(rotr(w[i - 15], 7), rotr(w[i - 15], 18)), Nat32.bitshiftRight(w[i - 15], 3));
      let s1 = Nat32.bitxor(Nat32.bitxor(rotr(w[i - 2], 17), rotr(w[i - 2], 19)), Nat32.bitshiftRight(w[i - 2], 10));
      w := w.concat([w[i - 16] +% s0 +% w[i - 7] +% s1]);
      i += 1;
    };
    w;
  };

  /// 32-bit right rotation.
  func rotr(x : Nat32, n : Nat32) : Nat32 {
    Nat32.bitor(Nat32.bitshiftRight(x, n), Nat32.bitshiftLeft(x, 32 - n));
  };

  /// 2^exponent as a Nat.
  func pow2(exponent : Nat) : Nat {
    var result = 1;
    var i = 0;
    while (i < exponent) {
      result *= 2;
      i += 1;
    };
    result;
  };

  /// Big-endian bytes of a 32-bit word.
  func wordToBytes(word : Nat32) : [Nat8] {
    let value = word.toNat();
    [
      (value / 16_777_216 % 256).toNat8(),
      (value / 65_536 % 256).toNat8(),
      (value / 256 % 256).toNat8(),
      (value % 256).toNat8(),
    ];
  };
};
