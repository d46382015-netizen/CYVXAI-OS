const { analyze } = require("./analyzer");

function print() {
  const r = analyze();

  console.log("\n================ CAUSAL FAILURE REPORT ================\n");

  console.log("SUMMARY:");
  console.log(JSON.stringify(r.summary, null, 2));

  if (r.divergence) {
    console.log("\nFIRST DIVERGENCE:");
    console.log(JSON.stringify(r.divergence, null, 2));
  }

  if (r.failure) {
    console.log("\nFAILURE:");
    console.log(JSON.stringify(r.failure, null, 2));
  }

  console.log("\nCAUSAL CHAIN (ROOT -> FAILURE):");
  console.log(JSON.stringify(r.causalChain, null, 2));

  console.log("\n=======================================================\n");
}

print();
