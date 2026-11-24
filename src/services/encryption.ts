import CryptoJS from "crypto-js";
import JSEncryptImport from "jsencrypt";
import { deployment } from "./deployment";
const JSEncrypt =
  typeof JSEncryptImport === "function"
    ? JSEncryptImport
    : (JSEncryptImport as unknown as { default: typeof JSEncryptImport })
        .default;
export function encryptionEnabled() {
  return true;
}
export function publicKey() {
  return deployment().rsaPublicKey;
}
function secureBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  // APP service contexts do not all expose WebCrypto. Android SecureRandom is available before login.
  // #ifdef APP-PLUS
  const nativePlus = (globalThis as any).plus;
  if (nativePlus?.android) {
    const generator = nativePlus.android.newObject(
      "java.security.SecureRandom",
    );
    for (let i = 0; i < length; i++)
      bytes[i] = nativePlus.android.invoke(generator, "nextInt", 256);
    return bytes;
  }
  // #endif
  throw new Error("当前终端不具备安全随机数能力，无法完成加密登录");
}
export function encryptPayload(payload: unknown): {
  body: string;
  encryptedKey: string;
} {
  const key = publicKey();
  if (!key)
    throw new Error("当前安装包部署信息不完整，请联系管理员获取正确版本");
  // The platform decodes the RSA envelope's Base64 into a UTF-8 String before
  // constructing the AES key. Use 32 ASCII characters so that round trip is
  // lossless; arbitrary binary AES bytes would be replaced during UTF-8 decode.
  const bytes = secureBytes(24),
    words: number[] = [];
  for (let i = 0; i < bytes.length; i++)
    words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  const asciiKey = CryptoJS.enc.Base64.stringify(
      CryptoJS.lib.WordArray.create(words, bytes.length),
    ),
    aes = CryptoJS.enc.Utf8.parse(asciiKey),
    encryptor = new JSEncrypt();
  encryptor.setPublicKey(key);
  const encryptedKey = encryptor.encrypt(CryptoJS.enc.Base64.stringify(aes));
  if (!encryptedKey) throw new Error("平台RSA公钥无效，不能加密登录信息");
  return {
    body: CryptoJS.AES.encrypt(JSON.stringify(payload), aes, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(),
    encryptedKey,
  };
}
