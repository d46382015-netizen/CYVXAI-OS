"use strict";

const crypto = require("node:crypto");

function createCredentialCipher(secret) {
  const material = String(secret || "").trim();
  if (material.length < 32) {
    const error = new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be at least 32 characters");
    error.code = "TOKEN_ENCRYPTION_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  const key = decodeKey(material);

  return {
    encrypt(value, context = "github-token") {
      const plaintext = Buffer.from(String(value || ""), "utf8");
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(String(context), "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      return {
        v: 1,
        alg: "A256GCM",
        iv: iv.toString("base64url"),
        tag: tag.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
      };
    },

    decrypt(envelope, context = "github-token") {
      if (!envelope || envelope.v !== 1 || envelope.alg !== "A256GCM") throw new Error("Unsupported credential envelope");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
      decipher.setAAD(Buffer.from(String(context), "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

function decodeKey(material) {
  if (/^[a-f0-9]{64}$/i.test(material)) return Buffer.from(material, "hex");
  if (/^[A-Za-z0-9_-]{43,44}$/.test(material)) {
    const decoded = Buffer.from(material, "base64url");
    if (decoded.length === 32) return decoded;
  }
  return crypto.createHash("sha256").update(material, "utf8").digest();
}

module.exports = { createCredentialCipher };
