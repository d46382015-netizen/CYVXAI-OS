"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "spark", "ui");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const source = ["app.js", "spark-client.js", "spark-render.js", "spark-sync.js", "spark-create-actions.js", "spark-control-actions.js"].map(read).join("\n");

test("visible controls are connected to runtime logic", () => {
  const ids = ["ignite-form", "approve-button", "execute-button", "new-spark-button", "copy-world-button", "refresh-worlds", "metric-sparks", "metric-worlds", "metric-leads", "metric-outcomes", "mission-progress", "world-grid"];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `${id} must exist`);
    assert.ok(source.includes(id), `${id} must be wired`);
  }
});

test("offer configuration reaches the browser client payload", () => {
  for (const id of ["offer-name", "offer-description", "price", "location", "contact-email", "payment-url"]) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(source.includes(id));
  }
  for (const property of ["offer_name", "offer_description", "price_cents", "payment_url"]) assert.ok(source.includes(property));
});

test("browser modules contain no transfer corruption", () => {
  assert.doesNotMatch(source, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.doesNotMatch(source, /\.messae\b/);
  assert.match(source, /activeSpark/);
  assert.match(source, /setInterval/);
});
