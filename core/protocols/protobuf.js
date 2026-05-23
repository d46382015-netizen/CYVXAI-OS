/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const crypto = require("node:crypto");
const { response } = require("../shared/attribution");

class ProtobufSchemas {
  encode(schemaName, payload) {
    const schema = inferSchema(payload);
    const canonical = canonicalize(payload);
    const encoded = Buffer.from(JSON.stringify(canonical), "utf8").toString("base64url");
    return response("protobuf-encode", {
      schemaName,
      wireFormat: "protobuf-lite-json",
      schema,
      encoded,
      checksum: crypto.createHash("sha256").update(encoded).digest("hex"),
    });
  }

  decode(schemaName, payload) {
    const decoded = typeof payload === "string"
      ? JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
      : payload && typeof payload === "object" && typeof payload.encoded === "string"
        ? JSON.parse(Buffer.from(payload.encoded, "base64url").toString("utf8"))
        : payload;
    return response("protobuf-decode", {
      schemaName,
      payload,
      decoded,
      checksum: crypto.createHash("sha256").update(JSON.stringify(canonicalize(decoded))).digest("hex"),
    });
  }
}

function inferSchema(value, path = "root") {
  if (Array.isArray(value)) {
    return {
      path,
      kind: "array",
      items: value.length ? inferSchema(value[0], `${path}[]`) : { kind: "any" },
    };
  }
  if (value && typeof value === "object") {
    return {
      path,
      kind: "object",
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, inferSchema(item, `${path}.${key}`)]),
      ),
    };
  }
  return {
    path,
    kind: value === null ? "null" : typeof value,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

module.exports = {
  ProtobufSchemas,
};
