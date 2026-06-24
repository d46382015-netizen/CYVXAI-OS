"use strict";

function nextActions({ pending, active, operational, metrics = {}, autonomy = {} }) {
  const actions = [];
  if (!metrics.sparks_total) actions.push(action("ignite", "Create the first Spark", "Turn one outcome into a bounded mission.", 100));
  if (pending) actions.push(action("approve", "Review pending authority", `${pending} mission(s) await owner approval.`, 95));
  if (active && !autonomy.enabled) actions.push(action("enable_autonomy", "Enable bounded autonomy", "Approved missions are active.", 90));
  if (operational && !metrics.leads_total) actions.push(action("distribute", "Distribute live Worlds", "Operational Worlds need qualified traffic.", 85));
  if (metrics.queued_followups) actions.push(action("follow_up", "Process qualified intent", `${metrics.queued_followups} follow-up item(s) are queued.`, 92));
  if (metrics.leads_total && !metrics.verified_outcomes) actions.push(action("prove_value", "Record verified outcomes", "Convert leads into evidence-backed value.", 88));
  if (!actions.length) actions.push(action("improve", "Run the next improvement cycle", "Use evidence to improve reliability and value efficiency.", 75));
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

function operatingState({ pending, active, operational, metrics = {} }) {
  if (active) return "executing";
  if (pending) return "awaiting_approval";
  if (operational && !metrics.leads_total) return "distribution_required";
  if (metrics.queued_followups) return "followup_required";
  if (metrics.verified_outcomes) return "learning_from_outcomes";
  return "ready_to_ignite";
}

function action(key, title, reason, priority) {
  return { key, title, reason, priority };
}

module.exports = { nextActions, operatingState };
