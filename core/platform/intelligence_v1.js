/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

function augmentIntelligencePlatform(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxIntelligenceAugmented) return;
  PlatformKernel.prototype.__cyvxIntelligenceAugmented = true;

  const {
    clone,
    createEvent,
    createPattern,
    createPriority,
    createRecommendation,
    idFrom,
  } = models;

  const originalCreatePattern = PlatformKernel.prototype.createPattern;
  const originalRecordOutcome = PlatformKernel.prototype.recordOutcome;
  const originalModelCompany = PlatformKernel.prototype.modelCompany;
  const originalCoordinateScenario = PlatformKernel.prototype.coordinateScenario;
  const originalExecutive = PlatformKernel.prototype.executive;
  const originalStatus = PlatformKernel.prototype.status;

  PlatformKernel.prototype.patterns = function patterns(query = {}) {
    return listRecords(this.snapshot().patterns || [], query);
  };

  PlatformKernel.prototype.recommendations = function recommendations(query = {}) {
    return listRecords(this.snapshot().recommendations || [], query);
  };

  PlatformKernel.prototype.priorities = function priorities(query = {}) {
    return listRecords(this.snapshot().priorities || [], query);
  };

  PlatformKernel.prototype.createPattern = function createPatternWithIntelligence(input = {}) {
    let pattern = null;
    this.mutate((state) => {
      const candidate = createPattern(normalizePatternInput(input));
      state.patterns = Array.isArray(state.patterns) ? state.patterns : [];
      pattern = upsertRecord(state, 'patterns', candidate, patternKey(candidate), 'pattern.created', 'pattern.updated', 'Pattern recorded: ' + candidate.title, candidate);
      return state;
    });
    return pattern;
  };

  PlatformKernel.prototype.generatePatterns = function generatePatterns(input = {}) {
    const state = this.snapshot();
    const drafts = derivePatternDrafts(state, input);
    return drafts.map((draft) => this.createPattern(draft));
  };

  PlatformKernel.prototype.createRecommendation = function createRecommendationWithIntelligence(input = {}) {
    let recommendation = null;
    this.mutate((state) => {
      const candidate = createRecommendation(normalizeRecommendationInput(input));
      state.recommendations = Array.isArray(state.recommendations) ? state.recommendations : [];
      recommendation = upsertRecord(state, 'recommendations', candidate, recommendationKey(candidate), 'recommendation.generated', 'recommendation.updated', 'Recommendation generated: ' + candidate.title, candidate);
      return state;
    });
    return recommendation;
  };

  PlatformKernel.prototype.generateRecommendations = function generateRecommendations(input = {}) {
    if (input && (input.recommendation_type || input.title || input.target_id || input.source_ids)) {
      return [this.createRecommendation(input)];
    }
    const state = this.snapshot();
    const drafts = deriveRecommendationDrafts(state, input);
    return drafts.map((draft) => this.createRecommendation(draft));
  };

  PlatformKernel.prototype.createPriority = function createPriorityWithIntelligence(input = {}) {
    let priority = null;
    this.mutate((state) => {
      const candidate = createPriority(normalizePriorityInput(input));
      state.priorities = Array.isArray(state.priorities) ? state.priorities : [];
      priority = upsertRecord(state, 'priorities', candidate, priorityKey(candidate), 'priority.calculated', 'priority.calculated', 'Priority calculated: ' + (candidate.title || candidate.targetType + ':' + String(candidate.targetId || 'unknown')), candidate);
      return state;
    });
    return priority;
  };

  PlatformKernel.prototype.calculatePriorities = function calculatePriorities(input = {}) {
    if (input && (input.target_id || input.targetId || input.target_type || input.targetType)) {
      return [this.createPriority(input)];
    }
    const state = this.snapshot();
    const drafts = derivePriorityDrafts(state, input);
    return drafts.map((draft) => this.createPriority(draft));
  };

  PlatformKernel.prototype.refreshIntelligence = function refreshIntelligence(input = {}) {
    const patterns = this.generatePatterns(input);
    const recommendations = this.generateRecommendations(input);
    const priorities = this.calculatePriorities(input);
    return {
      patterns: patterns,
      recommendations: recommendations,
      priorities: priorities,
      summary: this.intelligence(input),
    };
  };

  PlatformKernel.prototype.intelligence = function intelligence(input = {}) {
    const state = this.snapshot();
    return buildIntelligenceSummary(state, input);
  };

  PlatformKernel.prototype.recordOutcome = function recordOutcomeWithIntelligence(input = {}) {
    const outcome = originalRecordOutcome.call(this, input);
    this.refreshIntelligence({ source: 'outcome.created', domain: input.domain || input.metadata && input.metadata.domain || null, related_outcome_id: outcome && outcome.id });
    return outcome;
  };

  PlatformKernel.prototype.modelCompany = function modelCompanyWithIntelligence(input = {}) {
    const result = originalModelCompany.call(this, input);
    const domain = normalizeDomain(input && input.domain ? input.domain : 'company');
    this.refreshIntelligence({ domain: domain, source: 'model-company', related_mission_id: result && result.model && result.model.mission ? result.model.mission.id : null, related_outcome_id: result && result.model && result.model.outcome ? result.model.outcome.id : null });
    return Object.assign({}, result, { intelligence: this.intelligence({ domain: domain }) });
  };

  PlatformKernel.prototype.coordinateScenario = function coordinateScenarioWithIntelligence(input = {}) {
    const result = originalCoordinateScenario.call(this, input);
    const domain = normalizeDomain(input.domain || input.name || 'coordination');
    this.refreshIntelligence({ domain: domain, source: 'coordination', related_mission_id: result && result.mission ? result.mission.id : null, related_outcome_id: result && result.outcome ? result.outcome.id : null });
    return Object.assign({}, result, { intelligence: this.intelligence({ domain: domain }) });
  };

  PlatformKernel.prototype.executive = function executiveWithIntelligence() {
    const base = originalExecutive.call(this);
    const intelligence = this.intelligence();
    const state = this.snapshot();
    return Object.assign({}, base, {
      intelligence: intelligence,
      topPatterns: intelligence.topPatterns,
      topRecommendations: intelligence.topRecommendations,
      highestPriorityInterventions: highestPriorityItems(state, 'intervention'),
      highestPriorityMissions: highestPriorityItems(state, 'mission'),
      highestPriorityApprovals: highestPriorityItems(state, 'approval'),
      predictedCirImpact: intelligence.predictedCirImpact,
    });
  };

  PlatformKernel.prototype.status = function statusWithIntelligence() {
    const base = originalStatus.call(this);
    const state = this.snapshot();
    return Object.assign({}, base, { recommendations: (state.recommendations || []).length, priorities: (state.priorities || []).length, intelligence: this.intelligence() });
  };

  function derivePatternDrafts(state, input = {}) {
    const domain = normalizeDomain(input.domain || input.metadata && input.metadata.domain || 'coordination');
    const missions = missionsForDomain(state, domain);
    const missionIds = missions.slice(0, 3).map((item) => item.id);
    const outcomes = (state.outcomes || []).filter((item) => !missionIds.length || missionIds.includes(item.mission_id)).slice(0, 5);
    const knowledgeRecords = (state.knowledgeRecords || []).filter((item) => !missionIds.length || missionIds.includes(item.mission_id)).slice(0, 5);
    const cirMetrics = (state.cirMetrics || []).slice(0, 5);
    const approvals = (state.approvals || []).filter((item) => String(item.state || item.status || '').toLowerCase() === 'pending');
    const resources = (state.resources || []).filter((item) => Number(item.utilization || 0) >= 0.75);
    const drafts = [];

    if (outcomes.length) {
      const outcome = outcomes[0];
      const improved = Number(outcome.capability_delta && outcome.capability_delta.improved || 0) > 0;
      drafts.push({
        title: (domainTitle(domain) + ' ' + (improved ? 'success' : 'failure') + ' pattern').trim(),
        pattern_type: improved ? 'success' : 'failure',
        description: improved ? 'A mission completed with measurable capability improvement.' : 'A mission completed without meaningful capability improvement.',
        frequency: outcome.frequency != null ? Number(outcome.frequency) : 1,
        confidence: clamp01(Number(outcome.confidence != null ? outcome.confidence : outcome.trust_impact != null ? 0.5 + outcome.trust_impact : 0.6)),
        impact: clamp01(Math.abs(Number(outcome.capability_impact || 0)) + Math.abs(Number(outcome.constitutional_impact || 0))),
        capability_contribution: Number(outcome.capability_delta && outcome.capability_delta.improved || outcome.capability_impact || 0),
        related_entity_ids: Array.isArray(outcome.entity_ids) ? clone(outcome.entity_ids) : [],
        related_mission_ids: outcome.mission_id ? [outcome.mission_id] : [],
        relatedObjects: [outcome.id].concat(outcome.mission_id ? [outcome.mission_id] : [], knowledgeRecords[0] ? [knowledgeRecords[0].id] : []).filter(Boolean),
        evidence: [buildEvidence(outcome), knowledgeRecords[0] ? buildEvidence(knowledgeRecords[0]) : null, cirMetrics[0] ? buildEvidence(cirMetrics[0]) : null].filter(Boolean),
        trust_score: clamp01(Number(outcome.trust_impact != null ? 0.5 + outcome.trust_impact : 0.5)),
        summary: improved ? 'Repeat evidence-backed execution and preserve the verified operating pattern.' : 'Strengthen evidence and reduce variance before repeating the action.',
        metadata: { domain, source: 'outcome', mission_id: outcome.mission_id || null },
      });
    }

    if (approvals.length) {
      const approval = approvals[0];
      drafts.push({
        title: domainTitle(domain) + ' bottleneck pattern',
        pattern_type: 'bottleneck',
        description: 'Approval latency is blocking the execution loop.',
        frequency: approvals.length,
        confidence: clamp01(Number(approval.confidence != null ? approval.confidence : 0.7)),
        impact: 0.55,
        capability_contribution: 0.12,
        related_entity_ids: approval.target_id ? [approval.target_id] : [],
        related_mission_ids: approval.target_type === 'mission' && approval.target_id ? [approval.target_id] : [],
        relatedObjects: [approval.id].concat(approval.target_id ? [approval.target_id] : []).filter(Boolean),
        evidence: [buildEvidence(approval)],
        trust_score: clamp01(Number(approval.confidence != null ? approval.confidence : 0.7)),
        summary: 'Reduce approval latency or pre-authorize low-risk mission patterns.',
        metadata: { domain, source: 'approval', approval_id: approval.id },
      });
    }

    if (resources.length) {
      const resource = resources[0];
      drafts.push({
        title: domainTitle(domain) + ' resource constraint pattern',
        pattern_type: 'resource_constraint',
        description: 'High resource utilization is constraining execution capacity.',
        frequency: resources.length,
        confidence: clamp01(Number(resource.utilization != null ? resource.utilization : 0.75)),
        impact: clamp01(Number(resource.utilization || 0.75)),
        capability_contribution: 0.18,
        related_entity_ids: [resource.id],
        relatedObjects: [resource.id],
        evidence: [buildEvidence(resource)],
        trust_score: 0.5,
        summary: 'Rebalance or release constrained resources before adding more work.',
        metadata: { domain, source: 'resource', resource_id: resource.id },
      });
    }

    const opportunity = (state.opportunities || [])[0];
    if (opportunity) {
      drafts.push({
        title: domainTitle(domain) + ' opportunity pattern',
        pattern_type: 'opportunity',
        description: opportunity.description || 'Recurring opportunity detected from live platform state.',
        frequency: 1,
        confidence: clamp01(Number(opportunity.confidence != null ? opportunity.confidence : 0.6)),
        impact: clamp01(Number(opportunity.expected_value || 0) / 10000),
        capability_contribution: clamp01(Number(opportunity.capability_impact || 0.2)),
        related_entity_ids: Array.isArray(opportunity.entity_ids) ? clone(opportunity.entity_ids) : [],
        related_mission_ids: opportunity.mission_id ? [opportunity.mission_id] : [],
        relatedObjects: [opportunity.id].concat(opportunity.mission_id ? [opportunity.mission_id] : []).filter(Boolean),
        evidence: [buildEvidence(opportunity)],
        trust_score: clamp01(Number(opportunity.confidence != null ? opportunity.confidence : 0.6)),
        summary: 'Opportunity intelligence should be reused in future mission planning.',
        metadata: { domain, source: 'opportunity', opportunity_id: opportunity.id },
      });
    }

    if (knowledgeRecords.length) {
      const knowledge = knowledgeRecords[0];
      drafts.push({
        title: domainTitle(domain) + ' learning pattern',
        pattern_type: 'success',
        description: knowledge.lesson_learned || 'Learning record indicates a compounding pattern.',
        frequency: knowledge.revision != null ? Number(knowledge.revision) + 1 : 1,
        confidence: clamp01(Number(knowledge.confidence != null ? knowledge.confidence : 0.7)),
        impact: clamp01(Number(knowledge.capability_delta || 0.2)),
        capability_contribution: Number(knowledge.capability_delta || 0.2),
        related_entity_ids: Array.isArray(knowledge.entity_ids) ? clone(knowledge.entity_ids) : [],
        related_mission_ids: knowledge.mission_id ? [knowledge.mission_id] : [],
        relatedObjects: [knowledge.id].concat(knowledge.mission_id ? [knowledge.mission_id] : []).filter(Boolean),
        evidence: [buildEvidence(knowledge)],
        trust_score: clamp01(Number(knowledge.confidence != null ? knowledge.confidence : 0.7)),
        summary: knowledge.future_recommendation || 'Reuse the lesson in the next mission.',
        metadata: { domain, source: 'knowledge', knowledge_record_id: knowledge.id },
      });
    }

    return drafts;
  }

  function deriveRecommendationDrafts(state, input = {}) {
    const domain = normalizeDomain(input.domain || input.metadata && input.metadata.domain || 'coordination');
    const drafts = [];
    const pendingApproval = (state.approvals || []).find((item) => String(item.state || item.status || '').toLowerCase() === 'pending');
    const topSignificance = (state.significanceRecords || []).slice().sort((a, b) => Number(b.salience || b.importance || 0) - Number(a.salience || a.importance || 0))[0] || null;
    const topMission = missionsForDomain(state, domain)[0] || (state.missions || [])[0] || null;
    const topPattern = (state.patterns || []).slice().sort((a, b) => Number(b.frequency || 0) + Number(b.confidence || 0) - (Number(a.frequency || 0) + Number(a.confidence || 0)))[0] || null;
    const topOpportunity = (state.opportunities || [])[0] || null;
    const topPriority = (state.priorities || []).slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null;
    const topNextAction = (state.nextBestActions || [])[0] || null;

    if (pendingApproval) {
      drafts.push({
        title: 'Approve ' + String(pendingApproval.target_id || 'mission'),
        recommendation_type: 'approval_path',
        rationale: 'Pending approval is the primary blocker in the execution loop.',
        confidence: clamp01(Number(pendingApproval.confidence != null ? pendingApproval.confidence : 0.75)),
        relatedObjects: [pendingApproval.id].concat(pendingApproval.target_id ? [pendingApproval.target_id] : []).filter(Boolean),
        related_object_ids: [pendingApproval.id].concat(pendingApproval.target_id ? [pendingApproval.target_id] : []).filter(Boolean),
        source_ids: [pendingApproval.id],
        expected_impact: { capability: 0.12, trust: 0.14, roi: 0.08 },
        metadata: { domain, source: 'approval', target_type: pendingApproval.target_type, target_id: pendingApproval.target_id },
      });
    }

    if (topSignificance) {
      drafts.push({
        title: 'Intervene on ' + (topSignificance.title || topSignificance.id),
        recommendation_type: 'intervention',
        rationale: topSignificance.rationale || 'Significance record indicates a change that deserves action.',
        confidence: clamp01(Number(topSignificance.confidence != null ? topSignificance.confidence : 0.7)),
        relatedObjects: [topSignificance.id].concat(topSignificance.reality_object_id ? [topSignificance.reality_object_id] : []).filter(Boolean),
        related_object_ids: [topSignificance.id].concat(topSignificance.reality_object_id ? [topSignificance.reality_object_id] : []).filter(Boolean),
        source_ids: [topSignificance.id].concat(topSignificance.reality_object_id ? [topSignificance.reality_object_id] : []).filter(Boolean),
        expected_impact: { capability: clamp01(Number(topSignificance.salience || topSignificance.importance || 0)), trust: 0.12, roi: clamp01(Number(topSignificance.salience || 0) * 0.8) },
        metadata: { domain, source: 'significance', criterion_id: topSignificance.criterion_id, reality_object_id: topSignificance.reality_object_id },
      });
    }

    if (topMission) {
      drafts.push({
        title: 'Advance mission ' + (topMission.title || topMission.id),
        recommendation_type: 'mission',
        rationale: topMission.objective || 'A live mission should be advanced with explicit execution support.',
        confidence: clamp01(Number(topMission.confidence != null ? topMission.confidence : 0.7)),
        relatedObjects: [topMission.id].concat(Array.isArray(topMission.target_entity_ids) ? clone(topMission.target_entity_ids) : []).filter(Boolean),
        related_object_ids: [topMission.id].concat(Array.isArray(topMission.target_entity_ids) ? clone(topMission.target_entity_ids) : []).filter(Boolean),
        source_ids: [topMission.id].concat(topMission.significance_record_id ? [topMission.significance_record_id] : []).filter(Boolean),
        expected_impact: { capability: clamp01(Number(topMission.capability_delta && topMission.capability_delta.improved || 0.2)), trust: clamp01(Number(topMission.trust_score || 0.5)), roi: clamp01(Number(topMission.roi || 0.2)) },
        metadata: { domain, source: 'mission', mission_id: topMission.id },
      });
    }

    if (topPattern) {
      drafts.push({
        title: 'Reuse pattern ' + (topPattern.title || topPattern.id),
        recommendation_type: 'pattern',
        rationale: topPattern.summary || topPattern.description || 'Observed pattern should inform the next loop.',
        confidence: clamp01(Number(topPattern.confidence != null ? topPattern.confidence : 0.7)),
        relatedObjects: [topPattern.id].concat(Array.isArray(topPattern.related_entity_ids) ? clone(topPattern.related_entity_ids) : []).filter(Boolean),
        related_object_ids: [topPattern.id].concat(Array.isArray(topPattern.related_entity_ids) ? clone(topPattern.related_entity_ids) : []).filter(Boolean),
        source_ids: [topPattern.id].concat(Array.isArray(topPattern.related_mission_ids) ? clone(topPattern.related_mission_ids) : []).filter(Boolean),
        expected_impact: { capability: clamp01(Number(topPattern.capability_contribution || 0.2)), trust: clamp01(Number(topPattern.trust_score || 0.5)), roi: clamp01(Number(topPattern.impact || 0.2)) },
        metadata: { domain, source: 'pattern', pattern_type: topPattern.pattern_type },
      });
    }

    if (topOpportunity) {
      drafts.push({
        title: 'Pursue opportunity ' + (topOpportunity.title || topOpportunity.id),
        recommendation_type: 'resource_allocation',
        rationale: topOpportunity.description || 'Opportunity should receive resources where it can create value.',
        confidence: clamp01(Number(topOpportunity.confidence != null ? topOpportunity.confidence : 0.6)),
        relatedObjects: [topOpportunity.id].concat(Array.isArray(topOpportunity.entity_ids) ? clone(topOpportunity.entity_ids) : []).filter(Boolean),
        related_object_ids: [topOpportunity.id].concat(Array.isArray(topOpportunity.entity_ids) ? clone(topOpportunity.entity_ids) : []).filter(Boolean),
        source_ids: [topOpportunity.id],
        expected_impact: { capability: clamp01(Number(topOpportunity.capability_impact || 0.2)), trust: 0.08, roi: clamp01(Number(topOpportunity.expected_value || 0) / 10000) },
        metadata: { domain, source: 'opportunity', opportunity_id: topOpportunity.id },
      });
    }

    if (topNextAction) {
      drafts.push({
        title: 'Follow next action ' + (topNextAction.title || topNextAction.id),
        recommendation_type: 'next_best_action',
        rationale: topNextAction.rationale || 'The highest ranked next action should be preserved.',
        confidence: clamp01(Number(topNextAction.confidence != null ? topNextAction.confidence : 0.7)),
        relatedObjects: [topNextAction.id].concat(Array.isArray(topNextAction.source_ids) ? clone(topNextAction.source_ids) : []).filter(Boolean),
        related_object_ids: [topNextAction.id].concat(Array.isArray(topNextAction.source_ids) ? clone(topNextAction.source_ids) : []).filter(Boolean),
        source_ids: Array.isArray(topNextAction.source_ids) ? clone(topNextAction.source_ids) : [topNextAction.id],
        expected_impact: clone(topNextAction.expected_impact || { capability: 0.12, trust: 0.12, roi: 0.1 }),
        metadata: { domain, source: 'next_best_action', kind: topNextAction.kind },
      });
    }

    return drafts;
  }

  function derivePriorityDrafts(state, input = {}) {
    const domain = normalizeDomain(input.domain || input.metadata && input.metadata.domain || 'coordination');
    const items = [];
    const resources = state.resources || [];
    const resourceAvailability = resources.length ? average(resources.map((item) => Number(item.available != null ? item.available : Math.max(0, Number(item.amount || 0) - Number(item.allocated || 0))) / Math.max(1, Number(item.amount || 0) || 1))) : 0.5;
    const trustAverage = (state.trusts || []).length ? average((state.trusts || []).map((item) => Number(item.trust_score != null ? item.trust_score : 0.5))) : 0.5;
    const cirImpact = state.cirMetrics && state.cirMetrics[0] ? Number(state.cirMetrics[0].score || 0.1) : 0.1;
    const significanceMap = new Map((state.significanceRecords || []).map((item) => [item.id, item]));
    const priorities = [];

    const candidates = [];
    (state.interventions || []).slice(0, 5).forEach((item) => candidates.push({ targetType: 'intervention', targetId: item.id, source: item }));
    (state.missions || []).slice(0, 5).forEach((item) => candidates.push({ targetType: 'mission', targetId: item.id, source: item }));
    (state.approvals || []).slice(0, 5).forEach((item) => candidates.push({ targetType: 'approval', targetId: item.id, source: item }));
    (state.recommendations || []).slice(0, 5).forEach((item) => candidates.push({ targetType: 'recommendation', targetId: item.id, source: item }));
    (state.nextBestActions || []).slice(0, 5).forEach((item) => candidates.push({ targetType: 'next_best_action', targetId: item.id, source: item }));

    for (const candidate of candidates) {
      const priority = calculatePriorityScore({ state, candidate, significanceMap, trustAverage, resourceAvailability, cirImpact, domain });
      priorities.push({
        title: priority.title,
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        score: priority.score,
        rationale: priority.rationale,
        relatedObjects: priority.relatedObjects,
        source_ids: priority.source_ids,
        metadata: { domain, source: 'priority-engine', target_type: candidate.targetType, target_id: candidate.targetId },
      });
    }

    priorities.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return priorities.slice(0, 10);
  }

  function calculatePriorityScore(context = {}) {
    const { candidate, significanceMap, trustAverage, resourceAvailability, cirImpact, domain } = context;
    const source = candidate.source || {};
    const significance = resolvePrioritySignificance(source, significanceMap);
    const confidence = Number(source.confidence != null ? source.confidence : source.trust_score != null ? source.trust_score : 0.5);
    const urgency = resolveUrgency(source, candidate.targetType);
    const constraintPressure = resolveConstraintPressure(context.state, source, candidate.targetType);
    const expectedImpact = resolveExpectedImpact(source);
    const score = clamp01(
      significance * 0.32 +
      urgency * 0.22 +
      trustAverage * 0.15 +
      confidence * 0.12 +
      resourceAvailability * 0.08 +
      (1 - constraintPressure) * 0.06 +
      Math.min(1, cirImpact + expectedImpact * 0.08) * 0.05
    );
    const rationale = [
      'Significance ' + round3(significance),
      'urgency ' + round3(urgency),
      'trust ' + round3(trustAverage),
      'confidence ' + round3(confidence),
      'resources ' + round3(resourceAvailability),
      'constraints ' + round3(constraintPressure),
      'CIR impact ' + round3(cirImpact),
    ].join(' | ');
    return {
      title: 'Priority for ' + candidate.targetType + ' ' + String(candidate.targetId || 'unknown'),
      score: round3(score),
      rationale,
      relatedObjects: [candidate.targetId].concat(Array.isArray(source.source_ids) ? source.source_ids : []).filter(Boolean),
      source_ids: [candidate.targetId].concat(Array.isArray(source.source_ids) ? source.source_ids : []).filter(Boolean),
    };
  }

  function resolvePrioritySignificance(source, significanceMap) {
    if (source && source.significance_record_id && significanceMap.has(source.significance_record_id)) {
      const record = significanceMap.get(source.significance_record_id);
      return Number(record.salience != null ? record.salience : record.importance != null ? record.importance / 10 : 0.5);
    }
    if (source && Array.isArray(source.significance_record_ids) && source.significance_record_ids.length && significanceMap.has(source.significance_record_ids[0])) {
      const record = significanceMap.get(source.significance_record_ids[0]);
      return Number(record.salience != null ? record.salience : record.importance != null ? record.importance / 10 : 0.5);
    }
    return Number(source && source.priority != null ? source.priority : source && source.confidence != null ? source.confidence : 0.5);
  }

  function resolveUrgency(source, targetType) {
    const state = String(source && source.state || source && source.status || '').toLowerCase();
    if (targetType === 'approval') {
      if (state === 'pending') return 1;
      if (state === 'escalated') return 0.95;
      if (state === 'rejected') return 0.9;
    }
    if (targetType === 'mission') {
      if (state === 'queued') return 0.95;
      if (state === 'running') return 0.88;
      if (state === 'blocked') return 0.96;
    }
    if (targetType === 'intervention') {
      if (state === 'proposed') return 0.9;
      if (state === 'approved') return 0.82;
    }
    return 0.72;
  }

  function resolveConstraintPressure(state, source, targetType) {
    const constraints = Array.isArray(state.constraints) ? state.constraints : [];
    const high = constraints.filter((item) => String(item.severity || '').toLowerCase() === 'high').length;
    const medium = constraints.filter((item) => String(item.severity || '').toLowerCase() === 'medium').length;
    const base = Math.min(1, (high * 0.3 + medium * 0.15) / Math.max(1, constraints.length || 1));
    if (targetType === 'approval') return clamp01(base + 0.1);
    if (targetType === 'mission' && String(source && source.status || '').toLowerCase() === 'blocked') return clamp01(base + 0.15);
    return clamp01(base);
  }

  function resolveExpectedImpact(source) {
    if (!source) return 0.2;
    const impact = source.expectedImpact || source.expected_impact || source.expected_impact || {};
    const impactValue = Number(impact.value != null ? impact.value : 0) / 10000;
    const capability = Number(impact.capability != null ? impact.capability : source.capability_impact != null ? source.capability_impact : 0);
    const roi = Number(impact.roi != null ? impact.roi : source.roi != null ? source.roi : 0);
    return Math.max(0, Math.min(1, impactValue + capability + Math.max(0, roi) / 10));
  }

  function buildIntelligenceSummary(state, input = {}) {
    const intelligence = summarizeIntelligence(state);
    const domain = normalizeDomain(input.domain || input.metadata && input.metadata.domain || 'coordination');
    return Object.assign({}, intelligence, {
      domain: domain,
      source: input.source || 'snapshot',
      topPatterns: intelligence.topPatterns.filter(Boolean),
      topRecommendations: intelligence.topRecommendations.filter(Boolean),
      highestPriorityItems: intelligence.highestPriorityItems.filter(Boolean),
      highestPriorityInterventions: highestPriorityItems(state, 'intervention'),
      highestPriorityMissions: highestPriorityItems(state, 'mission'),
      highestPriorityApprovals: highestPriorityItems(state, 'approval'),
      predictedCirImpact: intelligence.predictedCirImpact,
    });
  }

  function summarizeIntelligence(state) {
    const patterns = Array.isArray(state.patterns) ? state.patterns.slice() : [];
    const recommendations = Array.isArray(state.recommendations) ? state.recommendations.slice() : [];
    const priorities = Array.isArray(state.priorities) ? state.priorities.slice() : [];
    const topPatterns = patterns.sort((a, b) => Number(b.frequency || 0) + Number(b.confidence || 0) - (Number(a.frequency || 0) + Number(a.confidence || 0))).slice(0, 5);
    const topRecommendations = recommendations.sort((a, b) => (Number(b.confidence || 0) + recommendationImpactScore(b)) - (Number(a.confidence || 0) + recommendationImpactScore(a))).slice(0, 5);
    const highestPriorityItems = priorities.sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 5);
    const predictedCirImpact = round3(highestPriorityItems.reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max(1, highestPriorityItems.length || 1) * Math.max(0.1, (state.cirMetrics && state.cirMetrics[0] ? Number(state.cirMetrics[0].score || 0.1) : 0.1) * 1.5));
    return {
      patternCount: patterns.length,
      recommendationCount: recommendations.length,
      priorityCount: priorities.length,
      topPatterns,
      topRecommendations,
      highestPriorityItems,
      highestPriorityInterventions: highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'intervention'),
      highestPriorityMissions: highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'mission'),
      highestPriorityApprovals: highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'approval'),
      predictedCirImpact,
    };
  }

  function recommendationImpactScore(record) {
    const impact = record.expectedImpact || record.expected_impact || {};
    return Number(impact.capability || 0) + Number(impact.trust || 0) + Number(impact.roi || 0) / 10;
  }

  function highestPriorityItems(state, targetType) {
    return (Array.isArray(state.priorities) ? state.priorities : [])
      .filter((item) => String(item.targetType || '').toLowerCase() === String(targetType || '').toLowerCase())
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 5);
  }

  function upsertRecord(state, collectionName, record, key, createdEventType, updatedEventType, summary, payload) {
    const singular = collectionName === 'priorities' ? 'priority' : collectionName === 'recommendations' ? 'recommendation' : collectionName.slice(0, -1);
    const collection = Array.isArray(state[collectionName]) ? state[collectionName] : [];
    const existingIndex = collection.findIndex((item) => recordKey(item) === key);
    if (existingIndex >= 0) {
      const existing = collection[existingIndex];
      Object.assign(existing, clone(record), { updated_at: new Date().toISOString(), updatedAt: new Date().toISOString() });
      existing.history = Array.isArray(existing.history) ? existing.history : [];
      existing.history.unshift({ at: new Date().toISOString(), patch: clone(record) });
      state.events = Array.isArray(state.events) ? state.events : [];
      state.events.unshift(createEvent({ event_type: updatedEventType, subject_id: existing.id, summary, payload: { [singular]: existing, ...eventPayload(payload, existing) }, related_entity_ids: relatedIds(payload, existing), related_mission_id: payload && payload.related_mission_id || null }));
      return existing;
    }
    collection.unshift(record);
    state[collectionName] = collection;
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift(createEvent({ event_type: createdEventType, subject_id: record.id, summary, payload: { [singular]: record, ...eventPayload(payload, record) }, related_entity_ids: relatedIds(payload, record), related_mission_id: payload && payload.related_mission_id || null }));
    return record;
  }

  function eventPayload(payload, record) {
    const result = Object.assign({}, payload && typeof payload === 'object' ? clone(payload) : {}, { related_objects: Array.isArray(record.relatedObjects) ? clone(record.relatedObjects) : [], source_ids: Array.isArray(record.source_ids) ? clone(record.source_ids) : [] });
    return result;
  }

  function relatedIds(payload, record) {
    return Array.isArray(record.relatedObjectIds) ? clone(record.relatedObjectIds) : Array.isArray(record.related_object_ids) ? clone(record.related_object_ids) : Array.isArray(record.relatedObjects) ? clone(record.relatedObjects) : Array.isArray(payload && payload.related_entity_ids) ? clone(payload.related_entity_ids) : [];
  }

  function recordKey(record) {
    if (!record) return '';
    if (record.type === 'pattern') return patternKey(record);
    if (record.type === 'recommendation') return recommendationKey(record);
    if (record.type === 'priority') return priorityKey(record);
    return String(record.id || '');
  }

  function patternKey(record) {
    const domain = normalizeDomain(record.metadata && record.metadata.domain || record.domain || 'coordination');
    const related = Array.isArray(record.relatedObjects) ? record.relatedObjects.join('|') : Array.isArray(record.related_object_ids) ? record.related_object_ids.join('|') : Array.isArray(record.related_entity_ids) ? record.related_entity_ids.join('|') : '';
    return [record.pattern_type || 'pattern', domain, related].join('|');
  }

  function recommendationKey(record) {
    const domain = normalizeDomain(record.metadata && record.metadata.domain || record.domain || 'coordination');
    const related = Array.isArray(record.source_ids) ? record.source_ids.join('|') : Array.isArray(record.related_object_ids) ? record.related_object_ids.join('|') : Array.isArray(record.relatedObjects) ? record.relatedObjects.join('|') : '';
    return [record.recommendation_type || 'recommendation', domain, record.targetType || record.target_type || '', record.targetId || record.target_id || '', related].join('|');
  }

  function priorityKey(record) {
    const domain = normalizeDomain(record.metadata && record.metadata.domain || record.domain || 'coordination');
    return [record.targetType || record.target_type || 'target', record.targetId || record.target_id || '', domain].join('|');
  }

  function normalizePatternInput(input = {}) {
    const relatedObjects = Array.isArray(input.relatedObjects) ? clone(input.relatedObjects) : Array.isArray(input.related_objects) ? clone(input.related_objects) : [];
    const relatedEntityIds = Array.isArray(input.related_entity_ids) ? clone(input.related_entity_ids) : Array.isArray(input.related_entity_ids) ? clone(input.related_entity_ids) : [];
    return Object.assign({}, input, {
      relatedObjects: relatedObjects,
      related_object_ids: Array.isArray(input.related_object_ids) ? clone(input.related_object_ids) : relatedObjects,
      related_entity_ids: relatedEntityIds,
      related_mission_ids: Array.isArray(input.related_mission_ids) ? clone(input.related_mission_ids) : [],
      createdAt: input.createdAt || input.created_at,
      updatedAt: input.updatedAt || input.updated_at,
    });
  }

  function normalizeRecommendationInput(input = {}) {
    const relatedObjects = Array.isArray(input.relatedObjects) ? clone(input.relatedObjects) : Array.isArray(input.related_objects) ? clone(input.related_objects) : [];
    return Object.assign({}, input, {
      relatedObjects,
      related_object_ids: Array.isArray(input.related_object_ids) ? clone(input.related_object_ids) : relatedObjects,
      source_ids: Array.isArray(input.source_ids) ? clone(input.source_ids) : [],
      expected_impact: input.expected_impact || input.expectedImpact || {},
      createdAt: input.createdAt || input.created_at,
      updatedAt: input.updatedAt || input.updated_at,
    });
  }

  function normalizePriorityInput(input = {}) {
    const relatedObjects = Array.isArray(input.relatedObjects) ? clone(input.relatedObjects) : Array.isArray(input.related_objects) ? clone(input.related_objects) : [];
    return Object.assign({}, input, {
      relatedObjects,
      source_ids: Array.isArray(input.source_ids) ? clone(input.source_ids) : [],
      createdAt: input.createdAt || input.created_at,
      updatedAt: input.updatedAt || input.updated_at,
    });
  }

  function buildEvidence(record) {
    if (!record) return null;
    return {
      id: record.id,
      type: record.type || 'record',
      title: record.title || record.name || record.label || record.id,
      state: record.state || record.status || 'active',
      confidence: record.confidence != null ? Number(record.confidence) : record.trust_score != null ? Number(record.trust_score) : 0.5,
    };
  }

  function missionsForDomain(state, domain) {
    const normalized = normalizeDomain(domain);
    return (state.missions || []).filter((mission) => normalizeDomain(mission.metadata && mission.metadata.domain || mission.domain || normalized) === normalized || !normalized);
  }

  function normalizeDomain(value) {
    return String(value || 'coordination').toLowerCase();
  }

  function domainTitle(value) {
    return String(value || 'coordination').replace(/[-_]+/g, ' ').replace(/w/g, (ch) => ch.toUpperCase());
  }

  function listRecords(records, query = {}) {
    let items = Array.isArray(records) ? records.slice() : [];
    if (query.state) items = items.filter((item) => String(item.state || item.status || '').toLowerCase() === String(query.state).toLowerCase());
    if (query.status) items = items.filter((item) => String(item.status || '').toLowerCase() === String(query.status).toLowerCase());
    if (query.type) items = items.filter((item) => String(item.type || item.kind || item.recommendation_type || item.targetType || '').toLowerCase() === String(query.type).toLowerCase());
    if (query.target_id) items = items.filter((item) => item.targetId === query.target_id || item.target_id === query.target_id);
    if (query.target_type) items = items.filter((item) => String(item.targetType || item.target_type || '').toLowerCase() === String(query.target_type).toLowerCase());
    if (query.id) items = items.filter((item) => item.id === query.id);
    const limit = Number(query.limit || query.top || 0);
    return limit > 0 ? items.slice(0, limit) : items;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value || 0)));
  }

  function average(values) {
    const numbers = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => !Number.isNaN(value));
    if (!numbers.length) return 0.5;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }
}

module.exports = { augmentIntelligencePlatform };
