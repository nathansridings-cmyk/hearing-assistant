/* Seal Rammy Alerts messages. Same layout as rammy/sealed.py.
   HMAC-SHA256 keystream, then HMAC-SHA256. No third-party crypto library. */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RammySeal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256(bytes) {
    const bitLen = bytes.length * 8;
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, bitLen >>> 0, false);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let i = 0; i < padded.length; i += 64) {
      for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t += 1) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0; t < 64; t += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + s1 + ch + K[t] + w[t]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (s0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (value, index) {
      ov.setUint32(index * 4, value, false);
    });
    return out;
  }

  function concat(left, right) {
    const out = new Uint8Array(left.length + right.length);
    out.set(left, 0);
    out.set(right, left.length);
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    let key = keyBytes;
    if (key.length > 64) key = sha256(key);
    const block = new Uint8Array(64);
    block.set(key);
    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    for (let i = 0; i < 64; i += 1) {
      ipad[i] = block[i] ^ 0x36;
      opad[i] = block[i] ^ 0x5c;
    }
    return sha256(concat(opad, sha256(concat(ipad, msgBytes))));
  }

  function b64e(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function b64d(text) {
    const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
    const raw = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function utf8(text) {
    return new TextEncoder().encode(text);
  }

  function keyBytes(text) {
    const raw = b64d(String(text || "").trim());
    if (raw.length !== 32) throw new Error("That pairing code is not from Rammy.");
    return raw;
  }

  function splitKeys(key) {
    return {
      enc: hmacSha256(key, utf8("rammy-alerts-enc")),
      mac: hmacSha256(key, utf8("rammy-alerts-mac"))
    };
  }

  function keystream(encKey, iv, nbytes) {
    const out = new Uint8Array(nbytes);
    let offset = 0;
    let counter = 0;
    while (offset < nbytes) {
      const block = new Uint8Array(iv.length + 4);
      block.set(iv, 0);
      block[iv.length] = (counter >>> 24) & 255;
      block[iv.length + 1] = (counter >>> 16) & 255;
      block[iv.length + 2] = (counter >>> 8) & 255;
      block[iv.length + 3] = counter & 255;
      const piece = hmacSha256(encKey, block);
      const take = Math.min(piece.length, nbytes - offset);
      out.set(piece.subarray(0, take), offset);
      offset += take;
      counter += 1;
    }
    return out;
  }

  function xor(left, right) {
    const out = new Uint8Array(left.length);
    for (let i = 0; i < left.length; i += 1) out[i] = left[i] ^ right[i];
    return out;
  }

  function same(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
    return diff === 0;
  }

  function seal(keyText, payload, ivBytes) {
    const key = keyBytes(keyText);
    const iv = ivBytes || crypto.getRandomValues(new Uint8Array(16));
    if (iv.length !== 16) throw new Error("That message could not be sealed.");
    const plain = utf8(JSON.stringify(sortKeys(payload)));
    const parts = splitKeys(key);
    const ct = xor(plain, keystream(parts.enc, iv, plain.length));
    const mac = hmacSha256(parts.mac, concat(utf8("R1"), concat(iv, ct)));
    return "R1." + [b64e(iv), b64e(ct), b64e(mac)].join(".");
  }

  function openSeal(keyText, token) {
    const key = keyBytes(keyText);
    const pieces = String(token || "").trim().split(".");
    if (pieces.length !== 4 || pieces[0] !== "R1") throw new Error("That message could not be opened.");
    const iv = b64d(pieces[1]);
    const ct = b64d(pieces[2]);
    const mac = b64d(pieces[3]);
    if (iv.length !== 16 || mac.length !== 32) throw new Error("That message could not be opened.");
    const parts = splitKeys(key);
    const expected = hmacSha256(parts.mac, concat(utf8("R1"), concat(iv, ct)));
    if (!same(mac, expected)) throw new Error("That message could not be opened.");
    const plain = xor(ct, keystream(parts.enc, iv, ct.length));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).sort().forEach(function (key) {
        out[key] = sortKeys(value[key]);
      });
      return out;
    }
    return value;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  return { sha256: sha256, seal: seal, openSeal: openSeal, keyBytes: keyBytes, bytesToHex: bytesToHex, b64d: b64d };
});
