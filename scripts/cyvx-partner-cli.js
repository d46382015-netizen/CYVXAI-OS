#!/usr/bin/env node
"use strict";
const { createPartnerBrief } = require("../core/partner/partner");
const goal = process.argv.slice(2).join(" ") || "Increase agency and create measurable outcomes.";
console.log(JSON.stringify(createPartnerBrief({ goal }), null, 2));
