/** Independent Node crypto model of the platform request wrapper. Synthetic keys only. */
const assert = require("node:assert/strict");
const { constants, privateDecrypt, createDecipheriv } = require("node:crypto");

function serverAesKey(encryptedKey, privateKey) {
  // Node/OpenSSL may disable PKCS#1 v1.5 privateDecrypt. Decode the RSA block
  // independently, strictly checking its type-2 padding instead of weakening it.
  const block = privateDecrypt(
    { key: privateKey, padding: constants.RSA_NO_PADDING },
    Buffer.from(encryptedKey, "base64"),
  );
  assert.ok(block[0] === 0 && block[1] === 2, "RSA type-2 block required");
  const separator = block.indexOf(0, 2);
  assert.ok(separator >= 10, "RSA padding must contain at least eight bytes");
  const rsaPlaintext = block.subarray(separator + 1).toString("utf8");
  // EncryptUtils.decryptByBase64 decodes bytes into UTF-8 String; decryptByAes
  // validates String length, then takes its UTF-8 bytes as the raw AES key.
  const aesPassword = Buffer.from(rsaPlaintext, "base64").toString("utf8");
  assert.ok([16, 24, 32].includes(aesPassword.length), "Server AES string length");
  const keyBytes = Buffer.from(aesPassword, "utf8");
  assert.ok([16, 24, 32].includes(keyBytes.length), "Server AES byte length");
  return keyBytes;
}

function decryptServerEnvelope(body, encryptedKey, privateKey) {
  const key = serverAesKey(encryptedKey, privateKey);
  const decipher = createDecipheriv(`aes-${key.length * 8}-ecb`, key, null);
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = { serverAesKey, decryptServerEnvelope };
