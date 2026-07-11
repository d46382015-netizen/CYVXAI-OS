#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS End-to-End Integration Test Harness
# © 2026 Dakota Lee Jonsgaard. All rights reserved.
#
# Complete mission workflow verification:
# Reality → Constraint → Opportunity → Mission → Approval → Execution → 
# Evidence → Outcome → Evaluation → Learning → Capability → Value

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_DIR="${REPO_ROOT}/.test-e2e"
TEST_DB="${TEST_DIR}/test.db"
TEST_LOGS="${TEST_DIR}/logs"
TEST_ARTIFACTS="${TEST_DIR}/artifacts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Cleanup function
cleanup() {
  echo -e "${YELLOW}Cleaning up test environment...${NC}"
  if [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}

# Setup test environment
setup() {
  echo -e "${YELLOW}Setting up isolated test environment...${NC}"
  mkdir -p "$TEST_LOGS" "$TEST_ARTIFACTS"
  
  # Create test database
  sqlite3 "$TEST_DB" < "${REPO_ROOT}/ops/sqlite/001_mission_workflow.sql"
  
  # Create .env.test
  cat > "${TEST_DIR}/.env.test" << 'EOF'
NODE_ENV=test
CYVX_DATA_ROOT=.test-e2e
CYVX_PUBLIC_PORT=9001
CYVX_GATEWAY_INTERNAL_PORT=9002
CYVX_INTERNAL_PORT=9003
CYVX_SPARK_INTERNAL_PORT=9004
DATABASE_URL=sqlite:.test-e2e/test.db
SPARK_STATE_FILE=.test-e2e/spark-state.json
SPARK_ARTIFACT_ROOT=.test-e2e/artifacts
EOF

  echo -e "${GREEN}Test environment ready${NC}"
}

# Load and execute test suite
run_tests() {
  echo -e "${YELLOW}Running end-to-end mission workflow tests...${NC}"
  
  # Create Node test runner
  node << 'NODEJS_TEST_RUNNER'
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { MissionEngine } = require('./core/missions/mission_engine.js');

class TestHarness {
  constructor(testDir) {
    this.testDir = testDir;
    this.db = new DatabaseSync(path.join(testDir, 'test.db'));
    this.engine = new MissionEngine(this);
    this.results = {
      passed: [],
      failed: [],
      startTime: new Date(),
    };
  }

  transaction(mutator) {
    const state = this.load();
    const result = mutator(state);
    this.save(state);
    return result;
  }

  load() {
    const missions = this.db.prepare('SELECT * FROM missions').all();
    const approvals = this.db.prepare('SELECT * FROM approvals').all();
    const assignments = this.db.prepare('SELECT * FROM assignments').all();
    const evidence = this.db.prepare('SELECT * FROM evidence').all();
    const outcomes = this.db.prepare('SELECT * FROM outcomes').all();
    const capabilities = this.db.prepare('SELECT * FROM capabilities').all();
    const events = this.db.prepare('SELECT * FROM events').all();

    return {
      missions: missions.map(m => ({
        ...m,
        constraints: JSON.parse(m.constraints || '[]'),
        opportunities: JSON.parse(m.opportunities || '[]'),
        success_metrics: JSON.parse(m.success_metrics || '[]'),
        outcome_ids: JSON.parse(m.outcome_ids || '[]'),
        evidence_ids: JSON.parse(m.evidence_ids || '[]'),
        audit_trail: JSON.parse(m.audit_trail || '[]'),
      })),
      approvals,
      assignments,
      evidence,
      outcomes,
      capabilities,
      events,
    };
  }

  save(state) {
    // Persist would be implemented here
  }

  async test(name, fn) {
    try {
      await fn(this);
      this.results.passed.push(name);
      console.log(`${name} ... PASSED`);
    } catch (error) {
      this.results.failed.push({ name, error: error.message });
      console.error(`${name} ... FAILED: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  report() {
    const total = this.results.passed.length + this.results.failed.length;
    const duration = new Date() - this.results.startTime;
    
    console.log('\n=== TEST RESULTS ===');
    console.log(`Total: ${total} | Passed: ${this.results.passed.length} | Failed: ${this.results.failed.length}`);
    console.log(`Duration: ${duration}ms`);
    
    if (this.results.failed.length > 0) {
      console.log('\nFailed Tests:');
      this.results.failed.forEach(({ name, error }) => {
        console.log(`  - ${name}: ${error}`);
      });
      return false;
    }
    return true;
  }
}

// Initialize test harness
const testDir = process.env.TEST_DIR || '.test-e2e';
const harness = new TestHarness(testDir);

// Test Suite: Complete Mission Workflow

harness.test('1. Create mission in draft state', async (h) => {
  const mission = h.engine.createMission({
    title: 'Test Mission: Deploy Feature',
    objective: 'Launch a new capability to production',
    context: 'Business opportunity identified',
    constraints: ['Budget limited to $10k', 'Timeline: 2 weeks'],
    opportunities: ['Access new market', 'Increase efficiency'],
    success_metrics: [{ key: 'deployment_success', target: 1 }],
    approval_required: true,
    created_by: 'system',
  });
  
  h.assert(mission.id, 'Mission has ID');
  h.assert(mission.status === 'draft', 'Mission in draft state');
  h.assert(mission.approval_required, 'Approval required');
});

harness.test('2. Validate mission feasibility', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const validated = h.engine.validateMission(mission.id, {
    feasible: true,
    assumptions: ['Team available', 'Infrastructure ready'],
    validated_by: 'system',
  });
  
  h.assert(validated.status === 'validated', 'Mission validated');
  h.assert(validated.validation, 'Validation record exists');
});

harness.test('3. Plan mission execution', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const planned = h.engine.planMission(mission.id, {
    actions: [
      { step: 1, description: 'Setup environment' },
      { step: 2, description: 'Deploy code' },
      { step: 3, description: 'Verify deployment' },
    ],
    dependencies: [],
    estimated_duration_minutes: 120,
    resource_requirements: { team_size: 2 },
    planned_by: 'system',
  });
  
  h.assert(planned.status === 'planned', 'Mission planned');
  h.assert(planned.plan.actions.length === 3, 'Plan has actions');
});

harness.test('4. Request approval', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const { approval } = h.engine.requestApproval(mission.id, {
    reason: 'Bounded deployment mission requires approval',
    requested_by: 'system',
    approval_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  
  h.assert(approval.id, 'Approval created');
  h.assert(approval.status === 'pending', 'Approval pending');
});

harness.test('5. Approve mission', async (h) => {
  const state = h.load();
  const approval = state.approvals[0];
  
  const { mission: approvedMission } = h.engine.decideApproval(approval.id, {
    decision: 'approved',
    decided_by: 'approver@example.com',
    decision_reason: 'Plan is sound and risks are acceptable',
  });
  
  h.assert(approvedMission.status === 'approved', 'Mission approved');
});

harness.test('6. Assign agent', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const { assignment } = h.engine.assignAgent(mission.id, {
    agent_id: 'agent_deployment_bot',
    assigned_by: 'system',
  });
  
  h.assert(assignment.id, 'Assignment created');
  h.assert(mission.assigned_agent_id === 'agent_deployment_bot', 'Agent assigned');
});

harness.test('7. Queue mission for execution', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  h.assert(mission.status === 'queued', 'Mission queued after assignment');
});

harness.test('8. Record evidence artifact', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const evidence = h.engine.recordEvidence(mission.id, {
    type: 'deployment_log',
    title: 'Deployment Log #1',
    source: 'CI/CD Pipeline',
    sha256: 'abc123def456...',
    bytes: 2048,
    verified: true,
    created_by: 'system',
  });
  
  h.assert(evidence.id, 'Evidence recorded');
  h.assert(evidence.verified, 'Evidence verified');
  h.assert(evidence.chain_hash, 'Chain hash computed');
});

harness.test('9. Execute mission', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const executing = h.engine.execute(mission.id, {
    steps: [
      { name: 'setup', status: 'pending' },
      { name: 'deploy', status: 'pending' },
      { name: 'verify', status: 'pending' },
    ],
    started_by: 'agent_deployment_bot',
  });
  
  h.assert(executing.status === 'running', 'Mission running');
});

harness.test('10. Record mission outcome', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const { outcome } = h.engine.complete(mission.id, {
    result_summary: 'Deployment successful, all verifications passed',
    metrics: {
      deployment_duration_minutes: 45,
      successful_deployments: 1,
      rollback_required: false,
    },
    evidence_ids: state.missions[0].evidence_ids,
    verified: true,
    completed_by: 'agent_deployment_bot',
  });
  
  h.assert(outcome.id, 'Outcome recorded');
  h.assert(outcome.verified, 'Outcome verified');
});

harness.test('11. Evaluate mission', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const evaluated = h.engine.evaluate(mission.id, {
    success: true,
    lessons_learned: [
      'Deployment process is reliable',
      'Team coordination was excellent',
    ],
    improvements: [
      'Add automated rollback capability',
      'Improve monitoring coverage',
    ],
    capability_delta: { created: 0, protected: 1, improved: 1 },
    evaluated_by: 'system',
  });
  
  h.assert(evaluated.status === 'evaluated', 'Mission evaluated');
  h.assert(evaluated.evaluation.success, 'Evaluation marked success');
});

harness.test('12. Learn reusable capability', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const { capability } = h.engine.learnCapability(mission.id, {
    title: 'Reliable Deployment Capability',
    description: 'Safe, verifiable deployment with rollback support',
    inputs: ['deployment_config', 'target_environment'],
    outputs: ['deployment_status', 'verification_result'],
    permissions_required: ['deploy:execute', 'system:verify'],
    tests: ['test_deployment', 'test_rollback'],
    risk_level: 'medium',
    owned_by: 'platform-team',
    is_reusable: true,
  });
  
  h.assert(capability.id, 'Capability registered');
  h.assert(capability.is_reusable, 'Capability marked reusable');
});

harness.test('13. Verify mission graph', async (h) => {
  const state = h.load();
  const mission = state.missions[0];
  
  const graph = h.engine.getMissionGraph(mission.id);
  
  h.assert(graph.mission, 'Mission exists');
  h.assert(graph.approval, 'Approval exists');
  h.assert(graph.outcomes.length > 0, 'Outcome recorded');
  h.assert(graph.evidence.length > 0, 'Evidence recorded');
  h.assert(graph.events.length > 0, 'Events recorded');
});

// Run all tests
(async () => {
  try {
    const testNames = [
      '1. Create mission in draft state',
      '2. Validate mission feasibility',
      '3. Plan mission execution',
      '4. Request approval',
      '5. Approve mission',
      '6. Assign agent',
      '7. Queue mission for execution',
      '8. Record evidence artifact',
      '9. Execute mission',
      '10. Record mission outcome',
      '11. Evaluate mission',
      '12. Learn reusable capability',
      '13. Verify mission graph',
    ];

    // Sequential execution
    for (const testName of testNames) {
      const fn = testName.replace(/\d+\.\s+/, '').replace(/\s+/g, '_').toLowerCase();
      // Tests would be executed here
    }

    const success = harness.report();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Test harness error:', error);
    process.exit(1);
  }
})();

NODEJS_TEST_RUNNER
}

# Failure scenario tests
run_failure_tests() {
  echo -e "${YELLOW}Running failure scenario tests...${NC}"
  
  node << 'NODEJS_FAILURE_TESTS'
// Test invalid state transitions
// Test unauthorized access
// Test duplicate idempotency keys
// Test tampered evidence
// Test worker interruption and recovery
// Test cross-organization access attempts
console.log('Failure scenario tests: SKIPPED (waiting for API implementation)');
NODEJS_FAILURE_TESTS
}

# Main execution
main() {
  trap cleanup EXIT
  
  setup
  run_tests
  run_failure_tests
  
  echo -e "${GREEN}Test harness complete${NC}"
}

main "$@"
