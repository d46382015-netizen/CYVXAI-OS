#!/usr/bin/env node
"use strict";
const {analytics}=require("../core/analytics/user-analytics");
console.log(JSON.stringify(analytics(),null,2));
