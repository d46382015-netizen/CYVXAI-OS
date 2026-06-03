const input = document.getElementById("realityInput");
const output = document.getElementById("analysisOutput");
const topConstraint = document.getElementById("topConstraint");
const topOpportunity = document.getElementById("topOpportunity");
const nextAction = document.getElementById("nextAction");

function analyzeReality(){
  const text = (input.value || "").toLowerCase();

  const repo = /repo|github|commit|code|readme|package/.test(text);
  const revenue = /revenue|customer|sales|roi|money|client/.test(text);
  const deploy = /deploy|server|hosting|public|domain|production/.test(text);
  const proof = /proof|evidence|outcome|trust|prediction/.test(text);

  const constraint = deploy ? "Deployment/public access is the current bottleneck."
    : revenue ? "Revenue needs outcome-backed proof and a clear first customer wedge."
    : repo ? "Repository reality needs prioritization into one executable mission."
    : proof ? "Proof exists, but needs repeatable outcome volume."
    : "Reality is messy; CYVX should compress it into one mission.";

  const opportunity = revenue ? "Use proof pack as the revenue wedge."
    : repo ? "Turn repo state into a live capability graph."
    : deploy ? "Create a public demo surface from the proof pack."
    : "Generate one outcome-backed mission now.";

  const action = "Run one reality → mission → outcome loop and record the result.";

  topConstraint.textContent = constraint;
  topOpportunity.textContent = opportunity;
  nextAction.textContent = action;

  output.textContent = JSON.stringify({
    topConstraint: constraint,
    topOpportunity: opportunity,
    nextBestAction: action,
    mission: "Create one measurable proof loop",
    confidence: 0.88
  }, null, 2);
}

document.getElementById("analyzeBtn")?.addEventListener("click", analyzeReality);
