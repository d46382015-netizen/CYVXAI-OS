# Spark / CYVX Repository Instructions

These instructions govern every Copilot change in this repository.

## Permanent hierarchy

- **Web4**: the era of an internet capable of coordinated, authorized action.
- **Spark**: the public product, creation platform, and outcome network through which people use Web4.
- **A Spark**: a durable executable intention with an owner, desired outcome, current reality, constraints, resources, authority, budget, plan, actions, evidence, outcomes, and learning.
- **World**: the persistent user-owned operational environment assembled around a Spark.
- **CYVX**: the intelligence and coordination kernel that turns Sparks into reality.
- **CYVX Labs**: the engineering and runtime layer operating CYVX beneath Spark.
- **Arc**: the durable orchestration method that moves intention through authority, action, proof, and improvement.
- **Capability**: a reliable, permissioned action a person, agent, service, application, or World can perform.

Do not rename or collapse these concepts.

## Locked public identity

- Product: **Spark**
- Tagline: **Turn ideas into assets.**
- Lifecycle: **Create. Automate. Own. Monetize.**
- Category at launch: **Creation platform**
- Strategic category: **The Web4 outcome network**
- Position: **The action layer of the internet**
- User identity: **Founder**
- Primary seat: **Create**
- Primary action: **Ignite a Spark** / **Spark it**
- Public question: **What do you want to make real?**
- Intelligence: **CYVX turns human intention into coordinated reality.**
- Defining statement: **The internet can finally act.**

Spark must not be positioned as a chatbot, generic agent, dashboard, no-code toy, content generator, speculative token, or guaranteed-income system.

## First undeniable product

Do not broaden the product until this flow works end to end:

**Idea -> Website -> Offer -> Payment -> Automation -> Proof**

The first World type is a local service business World. A founder must be able to enter an intention such as "I want to launch a mobile car-detailing business" and receive a real, owned operational system containing:

- Founder Brief and persistent Spark
- measurable mission and approval gates
- business identity and offer
- real website source and export
- lead capture or booking/request intake
- Stripe test-mode payment path
- customer and entitlement records
- durable payment-to-fulfillment automation
- ownership manifest
- proof package
- next improvement mission

The website is one asset inside a World. Do not reduce Spark to a website builder.

## Constitutional laws

Implement these as enforceable domain and policy rules:

1. Every Spark has an owner.
2. Every action requires authority.
3. Every claim requires provenance.
4. Every mission defines success before execution.
5. Every outcome is measured against reality.
6. Every capability has explicit limits.
7. Every autonomous action can be interrupted.
8. Every World is portable.
9. Every participant controls their identity.
10. Every successful cycle contributes reusable learning.
11. No metric exists without evidence.
12. No authority increases without proof.
13. No high-risk action bypasses approval.
14. No revenue is reported without verified provenance.
15. No model output can override authorization, policy, or tenant boundaries.

Permanent authority law:

**Authority must never grow faster than verified reliability.**

Authority progression:

observe -> recommend -> simulate -> sandbox -> prepare for approval -> approved execution -> bounded policy execution -> proven autonomy

Authority must decrease after failures, drift, anomalies, missing evidence, unexpected costs, or policy violations.

## Canonical loops

Public experience:

**Intend -> Approve -> Experience -> Verify -> Improve**

Internal Arc loop:

**Intend -> Understand -> Design -> Assemble -> Approve -> Act -> Verify -> Improve**

CYVX kernel:

**Reality -> Event -> Truth -> Attention -> Constraint -> Opportunity -> Intervention -> Decision -> Mission -> Assignment -> Capability -> Resource -> Execution -> Evidence -> Outcome -> Learning -> Evolution -> Improved Reality**

Economic loop:

**Create -> Automate -> Own -> Monetize -> Prove -> Compound**

Every loop must map to persisted objects, valid state transitions, events, evidence, and tests.

## Engineering constraints

- Preserve the useful existing Node.js/CommonJS runtime and port 3000.
- Use a modular monolith plus durable workers before considering microservices.
- SQLite must support local/UserLAnd operation; PostgreSQL must support hosted production.
- Do not require Docker, systemd, root, Redis, Kafka, a desktop computer, or paid model keys for local startup.
- Keep Android UserLAnd and ARM64 compatibility.
- Use repository-pattern storage, transactions, migrations, explicit state machines, database-backed jobs, leases, idempotency, retries, dead-letter handling, and structured JSON logs.
- JSON files may be used for exports or append-only evidence, not as the sole public production database.
- Model providers and third-party integrations must be optional adapters. The system must start without them.

## Required layers

1. Spark experience
2. CYVX kernel
3. Arc orchestration
4. World runtime
5. Capability network
6. Trust and governance
7. Proof network
8. Economic system
9. Gravity compounding layer

Do not create a new engine unless it owns a clear responsibility, is invoked by a real workflow, persists state, has validation and tests, and produces measurable output.

## Production standard

Every completed vertical slice must include:

- backend logic
- UI
- storage
- validation
- authorization
- automation
- logging
- tests
- documentation
- run and verification commands
- measurable proof

Forbidden:

- production mocks
- fake revenue, customers, deployments, proof, metrics, testimonials, or scarcity
- placeholder buttons
- disconnected screens
- routes returning success without real work
- swallowed errors
- duplicate sources of truth
- direct protected-branch writes
- live-payment activation without founder approval

## Immediate repository repair

Before broad expansion, audit and fix current defects, including the workload handler in `api/index.js` that references request-context values outside their valid scope. Add regression tests.

Also audit blocking child-process calls in request paths, wildcard CORS, optional production authentication, unsafe static serving, path traversal, in-memory-only rate limiting, missing request schemas, inconsistent errors, monolithic routing, missing timeouts, plaintext credentials, missing tenant scope, unsafe shell execution, missing job recovery, missing idempotency, and missing webhook verification.

## Required commands

Maintain or add:

- `npm run spark`
- `npm run dev`
- `npm start`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run migrate`
- `npm run worker`
- `npm run scheduler`
- `npm run smoke`
- `npm run security`
- `npm run backup`
- `npm run restore:verify`
- `npm run verify:first-world`
- `npm run verify`
- `npm run launch:check`

`npm run spark` must launch API, UI, durable worker, scheduler, WebSocket delivery, and health monitoring.

`npm run verify:first-world` must fail if any first-World stage is mocked, disconnected, unowned, unauthorized, unverified, or non-durable.

Do not describe the system as production-ready unless `npm run verify`, `npm run verify:first-world`, and `npm run launch:check` all pass.

## Implementation order

1. Truth and defect repair
2. Constitutional invariants
3. Production storage, identity, security, tenants, and validation
4. Durable Arc jobs, workers, approvals, and authority
5. Self, Spark, World, Flow, Proof, and Capability primitives
6. CYVX reality, constraint, mission, prediction, and next-action logic
7. First local-service-business World
8. Website asset
9. Offer asset
10. Stripe test-mode payment
11. Durable fulfillment automation
12. Proof and ownership exports
13. Public Create/Sparks/Worlds UI
14. Admin, analytics, billing, deployment, and legal surfaces
15. Launch gate

Continue implementing the next highest-leverage incomplete vertical slice. Do not stop at planning, documentation, schemas, or disconnected scaffolding.