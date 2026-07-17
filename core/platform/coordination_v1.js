/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 *
 * Compatibility entrypoint. The maintained implementation lives in
 * coordination_v1_clean.js; retaining this module prevents historical imports
 * from breaking while removing the corrupted patch artifact previously stored
 * at this path.
 */
"use strict";

module.exports = require("./coordination_v1_clean");
