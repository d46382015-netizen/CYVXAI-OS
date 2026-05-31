# CYVXAI Lovable App Build

Build the connected Lovable app as the mobile operator layer for CYVXAI-OS.

## Product

CYVXAI is an AI Chief of Staff for builders and teams. It answers:

> Given everything happening, what matters most, what should I do next, did it work, and what did we learn?

Do not build a generic dashboard. Do not expose every database table as a main screen. Compress the existing OS into a daily operator experience.

## Source System

Use the connected repository as the operating backend. The repo already exposes these important surfaces:

- `/status`
- `/health`
- `/api/v1/platform`
- `/api/v1/coordination`
- `/api/v1/next-best-action`
- `/api/v1/intelligence`
- `/api/v1/patterns`
- `/api/v1/recommendations`
- `/api/v1/priorities`
- `/api/v1/repository-health`
- `/api/v1/proof`
- `/api/v1/observations`
- `/api/v1/missions`
- `/api/v1/outcomes`
- `/api/v1/commands`

## Primary Loop

```text
Observe Reality
→ Detect Significance
→ Recommend Action
→ Draft Mission
→ Human Approves
→ Execute
→ Measure Outcome
→ Compare Prediction vs Actual
→ Update Trust
→ Learn
→ Recommend Next Best Action
```

## Bottom Navigation

Only use these main tabs:

1. Today
2. Autopilot
3. Missions
4. Proof
5. Memory

A Command Console can appear as a floating action or secondary screen.

## Screen 1 — Today / What Matters Now

Purpose: daily retention screen.

Hero copy:

> Given everything happening, here is what matters most.

Cards:

- Morning Briefing
- Highest Leverage Action
- Biggest Risk
- Biggest Opportunity
- Pending Outcome Check-in
- Active Missions

Metrics:

- Launch Readiness
- Decision Improvement Rate
- Prediction Accuracy
- Trust Score
- Reality Gap

Highest Leverage Action card fields:

- Title
- Why it matters
- Recommended action
- Expected outcome
- Impact score
- Confidence score
- Trust score
- Button: Start Mission

## Screen 2 — Autopilot

Purpose: make CYVX feel alive.

Cards:

- GitHub Observer
- Goal Observer
- Risk Observer
- Opportunity Observer
- Outcome Check-in Bot
- Mission Draft Queue

Each card shows:

- Detected signal
- Why it matters
- Suggested mission
- Expected impact
- Confidence
- Approve Mission
- Dismiss

Logic:

- Observers create observations and mission drafts.
- Mission drafts require approval before becoming active missions.
- Outcome check-ins appear after a mission is completed.

## Screen 3 — Missions

Group missions by lifecycle:

- Suggested
- Approved
- Queued
- In Progress
- Blocked
- Completed
- Measured
- Learned

Mission card fields:

- Objective
- Source decision
- Owner
- Priority score
- Expected outcome
- Due date
- Progress
- Current blocker
- Next step

Actions:

- Approve
- Start
- Mark Complete
- Record Outcome

## Screen 4 — Proof / Reality Verification

This is the moat.

Cards:

- Prediction vs Actual
- Reality Gap Tracker
- Repository Health Proof
- Trust Calibration
- Decision Improvement Rate
- CIR Evidence

Logic:

```text
Reality Gap = abs(predicted score - actual score)
Decision Improvement Rate = positive outcomes / followed recommendations
Trust changes based on prediction accuracy and outcome quality
```

## Screen 5 — Memory / Compounding Intelligence

Cards:

- What CYVX learned
- Successful patterns
- Failed patterns
- Decision replays
- Most accurate predictions
- Most valuable lessons
- What to reuse next

Learning card fields:

- Lesson
- Source outcome
- Reusable pattern
- Confidence change
- Applies next to
- Trust impact

## Core Data Objects

```ts
type Observation = {
  id: string
  title: string
  description: string
  source: string
  evidence?: string
  impactScore: number
  urgencyScore: number
  confidenceScore: number
  riskScore: number
  createdAt: string
}

type Decision = {
  id: string
  title: string
  whatMatters: string
  whyItMatters: string
  recommendation: string
  expectedOutcome: string
  impactScore: number
  urgencyScore: number
  riskScore: number
  effortScore: number
  confidenceScore: number
  trustScore: number
  priorityScore: number
  status: string
}

type MissionDraft = {
  id: string
  title: string
  sourceSignal: string
  whyItMatters: string
  suggestedObjective: string
  expectedImpact: number
  confidenceScore: number
  approvalStatus: 'pending' | 'approved' | 'dismissed'
}

type Mission = {
  id: string
  title: string
  objective: string
  status: 'suggested' | 'approved' | 'queued' | 'in_progress' | 'blocked' | 'completed' | 'measured' | 'learned'
  priorityScore: number
  expectedOutcome: string
  actualOutcome?: string
  progress: number
  dueDate?: string
}

type Outcome = {
  id: string
  missionId: string
  predictedOutcome: string
  actualOutcome: string
  predictedScore: number
  actualScore: number
  realityGap: number
  didWork: boolean
  lesson: string
  trustAdjustment: number
}
```

## Logic Requirements

### Priority Score

```ts
priorityScore = impactScore + urgencyScore + riskScore - effortScore + confidenceScore
```

### Next Best Action

Order of precedence:

1. If a completed mission has no outcome, ask for outcome check-in.
2. If a high-confidence mission draft exists, ask user to approve it.
3. If a high-risk observation exists, recommend a mitigation mission.
4. If a high-upside opportunity exists, recommend a validation mission.
5. Otherwise show the highest priority decision.

### Trust Update

```ts
accuracy = 100 - abs(predictedScore - actualScore)
trustAdjustment = accuracy >= 85 ? +3 : accuracy >= 70 ? +1 : accuracy >= 50 ? -2 : -5
```

### Morning Briefing

Generate from:

- highest priority decision
- highest risk
- highest opportunity
- pending outcome
- active mission count

## Design

Premium mobile command-center aesthetic:

- dark navy/black background
- glass cards
- cyan/purple gradients
- strong metric cards
- minimal clutter
- clear action buttons
- progress bars
- status chips

## Seed Data

Use this seed state if API data is missing:

- Goal: Launch useful CYVXAI MVP next week
- Highest Risk: Workflow instability may delay launch
- Highest Opportunity: Prove a complete reality loop using repo health
- Highest Leverage Action: Turn repo health into a mission and measure outcome
- Mission Draft: Stabilize CYVXAI proof loop
- Learning: Recommendations become valuable when tied to prediction, outcome, and trust update

## Acceptance Criteria

The app is complete when a user can:

1. Open Today and immediately see what matters most.
2. Approve an automated mission draft.
3. Start and complete a mission.
4. Record an outcome.
5. See prediction vs actual.
6. See trust update.
7. See a learning record created.
8. Receive a next best action.

## Key Rule

Build better decisions, better focus, better outcomes, and better learning every day. Everything else is secondary.
