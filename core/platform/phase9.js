"use strict";

function augmentPlatformKernel(PlatformKernel, models) {
  const {
    clone,
    createEvent,
    idFrom,
  } = models;

  function createObservation(record = {}) {
    const observedState = clone(record.observed_state || record.state || {});
    const observedChange = clone(record.observed_change || record.change || {});
    return {
      id: record.id || 'observation-' + idFrom(String(record.source || record.subject_id || record.summary || 'observation'), 'observation'),
      type: 'observation',
      title: record.title || record.summary || 'observation',
      name: record.name || record.title || record.summary || 'observation',
      state: record.state || 'recorded',
      source: record.source || 'cyvx',
      timestamp: record.timestamp || new Date().toISOString(),
      confidence: record.confidence != null ? Number(record.confidence) : 0.5,
      evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
      observed_state: observedState,
      observed_change: observedChange,
      subject_id: record.subject_id || null,
      related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
      linked_event_ids: Array.isArray(record.linked_event_ids) ? clone(record.linked_event_ids) : [],
      metadata: record.metadata || {},
      created_at: record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || new Date().toISOString(),
    };
  }

  function createNavigationState(input = {}) {
    const currentState = clone(input.current_state || input.current || {});
    const desiredState = clone(input.desired_state || input.desired || {});
    const predictedState = clone(input.predicted_state || input.predicted || {});
    const alternativeStates = Array.isArray(input.alternative_states) ? clone(input.alternative_states) : [];
    return {
      current_state: currentState,
      desired_state: desiredState,
      predicted_state: predictedState,
      alternative_states: alternativeStates,
      state_distance: Number(input.state_distance != null ? input.state_distance : estimateStateDistance(currentState, desiredState)),
      navigation_cost: Number(input.navigation_cost != null ? input.navigation_cost : Math.max(0, estimateStateDistance(currentState, desiredState) * 100)),
      navigation_confidence: Number(input.navigation_confidence != null ? input.navigation_confidence : 0.5),
    };
  }

  function estimateStateDistance(currentState, desiredState) {
    const current = JSON.stringify(currentState || {});
    const desired = JSON.stringify(desiredState || {});
    if (!current && !desired) return 0;
    if (!current || !desired) return 1;
    if (current === desired) return 0;
    const currentKeys = Object.keys(currentState || {}).length;
    const desiredKeys = Object.keys(desiredState || {}).length;
    return Number(Math.min(1, Math.abs(current.length - desired.length) / Math.max(current.length, desired.length, 1) + Math.abs(currentKeys - desiredKeys) * 0.05).toFixed(2));
  }

  function computeRealityMetrics(state) {
    const observations = state.observations || [];
    const events = state.events || [];
    const freshness = observations.length ? Math.max(0, 1 - Math.min(1, (Date.now() - Date.parse(observations[0].timestamp || observations[0].created_at || Date.now())) / (1000 * 60 * 60 * 24 * 7))) : 0;
    const confidence = observations.length ? Number((observations.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / observations.length).toFixed(2)) : 0.5;
    const drift = Number((1 - confidence + (events.length ? Math.min(0.4, events.length / 1000) : 0)).toFixed(2));
    return {
      observed_state_count: observations.length,
      graph_freshness: Number(freshness.toFixed(2)),
      graph_confidence: confidence,
      reality_drift: drift,
    };
  }

  function inferPortfolio(state) {
    const missions = state.missions || [];
    const byObjective = new Map();
    const byGoal = new Map();
    for (const mission of missions) {
      if (mission.objective_id) {
        byObjective.set(mission.objective_id, (byObjective.get(mission.objective_id) || 0) + 1);
      }
      if (mission.goal_id) {
        byGoal.set(mission.goal_id, (byGoal.get(mission.goal_id) || 0) + 1);
      }
    }
    return {
      mission_count: missions.length,
      overlap: missions.length ? Number((missions.filter((item, index, arr) => arr.findIndex((other) => other.objective_id && other.objective_id === item.objective_id) !== index).length / missions.length).toFixed(2)) : 0,
      conflicts: missions.filter((item) => item.state === 'blocked' || item.status === 'failed').length,
      dependencies: missions.reduce((sum, mission) => sum + (Array.isArray(mission.dependency_ids) ? mission.dependency_ids.length : 0), 0),
      strategic_alignment: Number((missions.reduce((sum, mission) => {
        const delta = mission.capability_delta || {};
        return sum + Number(delta.created || 0) + Number(delta.protected || 0) + Number(delta.improved || 0);
      }, 0) / Math.max(missions.length, 1)).toFixed(2)),
      value_creation: Number((missions.reduce((sum, mission) => sum + Number(mission.outcome_value || mission.value || 0), 0)).toFixed(2)),
      goal_span: byGoal.size,
      objective_span: byObjective.size,
    };
  }

  function evaluateNavigation(item) {
    const navigation = createNavigationState(item);
    return {
      current_state: navigation.current_state,
      desired_state: navigation.desired_state,
      predicted_state: navigation.predicted_state,
      alternative_states: navigation.alternative_states,
      state_distance: navigation.state_distance,
      navigation_cost: navigation.navigation_cost,
      navigation_confidence: navigation.navigation_confidence,
    };
  }

  PlatformKernel.prototype.createObservation = function createObservationEntry(input = {}) {
    let observation = null;
    this.mutate((state) => {
      observation = createObservation(input);
      state.observations = Array.isArray(state.observations) ? state.observations : [];
      state.observations.unshift(observation);
      const event = createEvent({
        event_type: 'observation.recorded',
        subject_id: observation.id,
        summary: 'Observation recorded: ' + observation.title,
        payload: { observation: observation, observed_state: observation.observed_state, observed_change: observation.observed_change },
        related_entity_ids: observation.related_entity_ids,
      });
      state.events.unshift(event);
      state.reality = computeRealityMetrics(state);
      return state;
    });
    return observation;
  };

  PlatformKernel.prototype.observations = function observationsList(query = {}) {
    const state = this.snapshot();
    const items = state.observations || [];
    if (!query.subject_id && !query.source) return items;
    return items.filter((item) => {
      if (query.subject_id && item.subject_id !== query.subject_id) return false;
      if (query.source && item.source !== query.source) return false;
      return true;
    });
  };

  PlatformKernel.prototype.reality = function realitySnapshot() {
    const state = this.snapshot();
    return Object.assign({ observations: (state.observations || []).length }, computeRealityMetrics(state), { drift: computeRealityMetrics(state).reality_drift });
  };

  PlatformKernel.prototype.navigationStateFor = function navigationStateFor(item) {
    return evaluateNavigation(item);
  };

  PlatformKernel.prototype.portfolio = function portfolioSummary() {
    const state = this.snapshot();
    return inferPortfolio(state);
  };

  const originalCreateGoal = PlatformKernel.prototype.createGoal;
  PlatformKernel.prototype.createGoal = function createGoalWithNavigation(input = {}) {
    const goal = originalCreateGoal.call(this, input);
    if (goal) Object.assign(goal, evaluateNavigation(goal));
    return goal;
  };

  const originalCreateInitiative = PlatformKernel.prototype.createInitiative;
  PlatformKernel.prototype.createInitiative = function createInitiativeWithNavigation(input = {}) {
    const initiative = originalCreateInitiative.call(this, input);
    if (initiative) Object.assign(initiative, evaluateNavigation(initiative));
    return initiative;
  };

  const originalCreateObjective = PlatformKernel.prototype.createObjective;
  PlatformKernel.prototype.createObjective = function createObjectiveWithNavigation(input = {}) {
    const objective = originalCreateObjective.call(this, input);
    if (objective) Object.assign(objective, evaluateNavigation(objective));
    return objective;
  };

  const originalCreateOpportunity = PlatformKernel.prototype.createOpportunity;
  PlatformKernel.prototype.createOpportunity = function createOpportunityWithNavigation(input = {}) {
    const opportunity = originalCreateOpportunity.call(this, input);
    if (opportunity) Object.assign(opportunity, evaluateNavigation(opportunity));
    return opportunity;
  };

  const originalCreateMission = PlatformKernel.prototype.createMission;
  PlatformKernel.prototype.createMission = function createMissionWithNavigation(input = {}) {
    const mission = originalCreateMission.call(this, input);
    if (mission) Object.assign(mission, evaluateNavigation(mission));
    return mission;
  };

  const originalLaunchMission = PlatformKernel.prototype.launchMission;
  PlatformKernel.prototype.launchMission = function launchMissionWithObservation(input = {}) {
    const observation = this.createObservation({
      title: input.observation_title || input.title || 'Mission observation',
      source: input.observation_source || 'mission-launch',
      subject_id: input.subject_id || input.objective_id || input.goal_id || null,
      confidence: input.observation_confidence != null ? input.observation_confidence : 0.7,
      evidence: input.observation_evidence || [],
      observed_state: input.observed_state || { mission: input.title || 'mission' },
      observed_change: input.observed_change || { status: 'initiated' },
      related_entity_ids: input.target_entity_ids || [],
    });
    const result = originalLaunchMission.call(this, input);
    if (result && result.mission) {
      result.mission.linked_event_ids = Array.isArray(result.mission.linked_event_ids) ? result.mission.linked_event_ids : [];
      result.mission.linked_event_ids.unshift(observation.linked_event_ids[0] || observation.id);
      result.mission.observation_id = observation.id;
    }
    return result;
  };

  const originalCreateDecision = PlatformKernel.prototype.createDecision;
  PlatformKernel.prototype.createDecision = function createDecisionWithNavigation(input = {}) {
    const decision = originalCreateDecision.call(this, input);
    if (decision) {
      Object.assign(decision, evaluateNavigation(decision));
      decision.confidence_history = Array.isArray(decision.confidence_history) ? decision.confidence_history : [];
      decision.confidence_history.unshift({ at: new Date().toISOString(), score: Number(decision.confidence || 0), source: decision.confidence_source || 'model' });
    }
    return decision;
  };


  const originalStatus = PlatformKernel.prototype.status;
  PlatformKernel.prototype.status = function statusWithReality() {
    const base = originalStatus.call(this);
    const reality = this.reality();
    return Object.assign({}, base, { observations: reality.observed_state_count, reality_drift: reality.reality_drift });
  };

  const originalExecutive = PlatformKernel.prototype.executive;
  PlatformKernel.prototype.executive = function executiveWithNavigation() {
    const base = originalExecutive.call(this);
    const state = this.snapshot();
    const reality = this.reality();
    const portfolio = this.portfolio();
    const goals = state.goals || [];
    const objectives = state.objectives || [];
    const missions = state.missions || [];
    const trustTrend = (state.trusts || []).reduce((sum, item) => sum + Number(item.trust_trend || 0), 0);
    return Object.assign({}, base, {
      observations: (state.observations || []).length,
      reality: reality,
      portfolio: portfolio,
      navigation: {
        current_state: { entities: (state.entities || []).length, missions: missions.length, objectives: objectives.length },
        desired_state: { reduced_drift: true, higher_trust: true, higher_capability: true },
        state_distance: Number(Math.min(1, reality.reality_drift || 0).toFixed(2)),
        navigation_confidence: Number(Math.max(0.4, 1 - (reality.reality_drift || 0)).toFixed(2)),
      },
      trust: Object.assign({}, base.trust || {}, {
        trend: Number(trustTrend.toFixed(2)),
        confidence_index: Number(Math.max(0, 1 - (reality.reality_drift || 0)).toFixed(2)),
      }),
      strategicCoordination: Object.assign({}, base.strategicCoordination || {}, {
        goals: goals.length,
        objectives: objectives.length,
        missions: missions.length,
        portfolio: portfolio,
      }),
    });
  };

  const originalRunSimulation = PlatformKernel.prototype.runSimulation;
  PlatformKernel.prototype.runSimulation = function runSimulationWithDrift(input = {}) {
    const result = originalRunSimulation.call(this, input);
    if (result && result.simulation) {
      result.simulation.predicted_state = clone(input.predicted_state || result.simulation.predicted_state || {});
      result.simulation.actual_state = clone(input.actual_state || {});
      result.simulation.drift = Number(Math.abs((result.simulation.confidence || 0.5) - (input.actual_confidence != null ? Number(input.actual_confidence) : 0.5)).toFixed(2));
    }
    return result;
  };
}

module.exports = { augmentPlatformKernel };
