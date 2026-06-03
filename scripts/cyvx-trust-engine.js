#!/usr/bin/env node
"use strict";
const {calculateTrust}=require("../core/trust/trust-engine");
console.log(JSON.stringify(calculateTrust(),null,2));
