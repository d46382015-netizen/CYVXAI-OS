#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

async function main() {
  const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
  const outputFile = String(process.env.GITHUB_OUTPUT || "").trim();
  if (!token || !repository || !outputFile) throw new Error("GH_TOKEN, GITHUB_REPOSITORY, and GITHUB_OUTPUT are required");

  const response = await fetch(`https://api.github.com/repos/${repository}/code-scanning/default-setup`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "cyvx-codeql-setup-detector",
    },
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }

  let mode;
  if (response.status === 200 && payload.state === "configured") {
    const languages = Array.isArray(payload.languages) ? payload.languages : [];
    if (!languages.some((language) => String(language).includes("javascript"))) {
      throw new Error("GitHub default CodeQL setup is configured without JavaScript/TypeScript");
    }
    mode = "default";
  } else if (response.status === 200) {
    mode = "advanced";
  } else if ([403, 404, 503].includes(response.status)) {
    mode = "fallback";
  } else {
    throw new Error(`Unexpected CodeQL default-setup API response ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  }

  fs.appendFileSync(outputFile, `mode=${mode}\nhttp_status=${response.status}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode,
    http_status: response.status,
    state: payload.state || null,
    languages: Array.isArray(payload.languages) ? payload.languages : [],
    query_suite: payload.query_suite || null,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exit(1);
});
