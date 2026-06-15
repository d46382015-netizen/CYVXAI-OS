"use strict";

const crypto = require("node:crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signWebhookBody(rawBody, secret) {
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is required");
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const provided = String(signatureHeader).trim();
  if (!/^sha256=[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = signWebhookBody(rawBody, secret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readRawBody(req, options = {}) {
  const limitBytes = Number(options.limitBytes || 1_000_000);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      const error = new Error(`payload exceeds ${limitBytes} bytes`);
      error.code = "PAYLOAD_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

module.exports = {
  readRawBody,
  sha256,
  signWebhookBody,
  verifyWebhookSignature,
};
