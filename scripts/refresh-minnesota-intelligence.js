"use strict";

const { createMinnesotaIntelligence } = require("../services/intelligence/minnesota");

async function main() {
  const intelligence = createMinnesotaIntelligence();
  const sourceIds = process.argv.slice(2).filter(Boolean);
  const result = await intelligence.refresh({ sourceIds });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || null, error: error.message })}\n`);
  process.exit(1);
});
