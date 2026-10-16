export function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string
): Promise<boolean> {
  try {
    if (!publicKeyHex || !signatureHex || !timestamp) {
      return false;
    }
    const keyBytes = hexToUint8Array(publicKeyHex);
    const sigBytes = hexToUint8Array(signatureHex);
    const dataBytes = new TextEncoder().encode(timestamp + rawBody);

    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
        false,
        ["verify"]
      );
    } catch {
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "Ed25519" },
        false,
        ["verify"]
      );
    }

    return await crypto.subtle.verify(
      cryptoKey.algorithm.name,
      cryptoKey,
      sigBytes,
      dataBytes
    );
  } catch (err) {
    return false;
  }
}
