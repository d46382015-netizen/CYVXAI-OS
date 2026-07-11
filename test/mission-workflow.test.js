/**
 * Mission Workflow End-to-End Tests
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 */
'use strict';

const assert = require('node:assert');
const { MissionEngine, MISSION_STATES } = require('../core/missions/mission_engine.js');

class MockStore {
  constructor() {
    this.data = {
      missions: [],
      approvals: [],
      assignments: [],
      evidence: [],
      outcomes: [],
      capabilities: [],
      events: [],
    };
  }

  transaction(fn) {
    const result = fn(this.data);
    return result;
  }

  load() {
    return this.data;
  }

  save(data) {
    this.data = data;
  }
}

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('=== Mission Workflow Tests ===\n');

  let store = new MockStore();
  let engine = new MissionEngine(store);

  await test('Create mission in draft state', () => {
    const mission = engine.createMission({
      title: 'Test Mission',
      objective: 'Test objective',
      created_by: 'test',
    });
    assert(mission.id, 'Mission has ID');
    assert.strictEqual(mission.status, MISSION_STATES.DRAFT);
  });

  await test('Validate mission', () => {
    const state = store.load();
    const mission = state.missions[0];
    const validated = engine.validateMission(mission.id, {
      feasible: true,
      validated_by: 'test',
    });
    assert.strictEqual(validated.status, MISSION_STATES.VALIDATED);
  });

  await test('Plan mission', () => {
    const state = store.load();
    const mission = state.missions[0];
    const planned = engine.planMission(mission.id, {
      actions: [{ step: 1, description: 'Test action' }],
      planned_by: 'test',
    });
    assert.strictEqual(planned.status, MISSION_STATES.PLANNED);
  });

  await test('Request approval', () => {
    const state = store.load();
    const mission = state.missions[0];
    const { approval } = engine.requestApproval(mission.id, {
      reason: 'Test approval',
      requested_by: 'test',
    });
    assert(approval.id);
    assert.strictEqual(approval.status, 'pending');
  });

  await test('Approve mission', () => {
    const state = store.load();
    const approval = state.approvals[0];
    const { mission } = engine.decideApproval(approval.id, {
      decision: 'approved',
      decided_by: 'test',
    });
    assert.strictEqual(mission.status, MISSION_STATES.APPROVED);
  });

  await test('Assign agent', () => {
    const state = store.load();
    const mission = state.missions[0];
    const { assignment } = engine.assignAgent(mission.id, {
      agent_id: 'test_agent',
      assigned_by: 'test',
    });
    assert(assignment.id);
  });

  await test('Queue mission after assignment', () => {
    const state = store.load();
    const mission = state.missions[0];
    assert.strictEqual(mission.status, MISSION_STATES.QUEUED);
  });

  await test('Record evidence', () => {
    const state = store.load();
    const mission = state.missions[0];
    const evidence = engine.recordEvidence(mission.id, {
      type: 'artifact',
      title: 'Test evidence',
      source: 'test',
      sha256: 'abc123',
      verified: true,
      created_by: 'test',
    });
    assert(evidence.id);
    assert(evidence.chain_hash);
  });

  await test('Execute mission', () => {
    const state = store.load();
    const mission = state.missions[0];
    const executing = engine.execute(mission.id, {
      steps: [],
      started_by: 'test_agent',
    });
    assert.strictEqual(executing.status, MISSION_STATES.RUNNING);
  });

  await test('Complete mission', () => {
    const state = store.load();
    const mission = state.missions[0];
    const { outcome } = engine.complete(mission.id, {
      result_summary: 'Mission completed',
      metrics: {},
      verified: true,
      completed_by: 'test_agent',
    });
    assert.strictEqual(outcome.status, 'completed');
  });

  await test('Evaluate mission', () => {
    const state = store.load();
    const mission = state.missions[0];
    const evaluated = engine.evaluate(mission.id, {
      success: true,
      lessons_learned: ['Lesson 1'],
      evaluated_by: 'test',
    });
    assert.strictEqual(evaluated.status, MISSION_STATES.EVALUATED);
  });

  await test('Learn capability', () => {
    const state = store.load();
    const mission = state.missions[0];
    const { capability } = engine.learnCapability(mission.id, {
      title: 'Learned Capability',
      description: 'Test capability',
      owned_by: 'test',
    });
    assert(capability.id);
    assert(capability.is_reusable);
  });

  await test('Get mission graph', () => {
    const state = store.load();
    const mission = state.missions[0];
    const graph = engine.getMissionGraph(mission.id);
    assert(graph.mission);
    assert(graph.approval);
    assert(graph.outcomes.length > 0);
    assert(graph.evidence.length > 0);
  });

  await test('Reject invalid state transition', () => {
    const state = store.load();
    const mission = state.missions[0];
    try {
      engine.validateMission(mission.id, { feasible: true, validated_by: 'test' });
      assert.fail('Should have thrown error');
    } catch (error) {
      assert(error.message.includes('transition'));
    }
  });

  await test('Reject decision without pending approval', () => {
    const state = store.load();
    const approval = state.approvals[0];
    try {
      engine.decideApproval(approval.id, { decision: 'approved', decided_by: 'test' });
      assert.fail('Should have thrown error');
    } catch (error) {
      assert(error.code);
    }
  });

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error(error);
  process.exit(1);
});
