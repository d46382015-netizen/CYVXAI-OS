"use strict";

function cognitiveCouncilSnapshot(input = {}) {
  const reality = input.reality || "Build toward the user's desired future.";
  const council = [
    {
      id: "argus",
      name: "ARGUS",
      perspective: "Reality",
      obsession: "Truth, evidence, observation, verification",
      question: "What is actually true?",
      current_focus: "Validate the user's current constraint.",
      latest_insight: "Distribution remains the dominant bottleneck.",
      confidence: 94,
      highlights: ["Constraints", "Evidence", "Reality"]
    },
    {
      id: "odyssey",
      name: "ODYSSEY",
      perspective: "Possibility",
      obsession: "Futures, opportunities, alternatives, exploration",
      question: "What could become true?",
      current_focus: "Explore alternate paths with higher upside.",
      latest_insight: "Creator distribution and partnerships create the strongest near-term path.",
      confidence: 88,
      highlights: ["Opportunities", "Future", "Paths"]
    },
    {
      id: "prometheus",
      name: "PROMETHEUS",
      perspective: "Creation",
      obsession: "Building, inventing, engineering, transforming",
      question: "What can we create?",
      current_focus: "Convert the mission into assets, systems, and execution primitives.",
      latest_insight: "The next asset should be a user-facing distribution engine.",
      confidence: 91,
      highlights: ["Assets", "Missions", "Systems"]
    },
    {
      id: "solon",
      name: "SOLON",
      perspective: "Judgment",
      obsession: "Decisions, tradeoffs, risk, leverage",
      question: "What is the wisest path?",
      current_focus: "Rank tradeoffs and avoid low-leverage action.",
      latest_insight: "Do not expand features before proving the user value loop.",
      confidence: 93,
      highlights: ["Risk", "Leverage", "Decisions"]
    },
    {
      id: "aurora",
      name: "AURORA",
      perspective: "Growth",
      obsession: "Expansion, compounding, wealth, influence, learning",
      question: "How do we multiply outcomes?",
      current_focus: "Find compounding loops and distribution flywheels.",
      latest_insight: "Reusable content and outcome loops compound faster than one-off services.",
      confidence: 89,
      highlights: ["Revenue", "Growth", "Learning"]
    }
  ];

  return {
    powered_by: "CYVX Ω",
    kernel: {
      name: "AEON Ω",
      type: "Reality Kernel",
      purpose: "Maintains identity, memory, goals, values, desired future, and reality model.",
      reality
    },
    council,
    synthesis: {
      title: "AEON Ω Synthesis",
      conclusion: "The highest leverage path is to validate reality, identify opportunity, build one asset, choose the wisest execution path, and compound outcomes.",
      recommended_action: "Launch one measurable distribution mission and record the outcome.",
      confidence: 91
    },
    generated_at: new Date().toISOString()
  };
}

module.exports = { cognitiveCouncilSnapshot };
