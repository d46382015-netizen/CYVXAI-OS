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

const attribution = Object.freeze({
  creator: "Dakota Lee Jonsgaard",
  product: "CYVX",
  copyright: "© 2026 Dakota Lee Jonsgaard. All rights reserved.",
  website: "https://cyvx.ai",
  contact: "dakota@cyvx.ai",
});

function timestamp() {
  return new Date().toISOString();
}

function withAttribution(payload, extra = {}) {
  return {
    ...payload,
    attribution,
    createdBy: attribution.creator,
    copyright: attribution.copyright,
    generatedAt: timestamp(),
    ...extra,
  };
}

function signReport(title, body, extra = {}) {
  return withAttribution({
    title,
    body,
    signedBy: attribution.creator,
  }, extra);
}

function response(type, data = {}, meta = {}) {
  return withAttribution({
    type,
    data,
  }, meta);
}

function envelope(type, data = {}, meta = {}) {
  return response(type, data, meta);
}

module.exports = {
  attribution,
  timestamp,
  withAttribution,
  signReport,
  response,
  envelope,
};
