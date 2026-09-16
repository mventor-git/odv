# ODV — MASTER HANDOFF / CONTINUATION STATE

Role contract: reading AI = Senior Solution Architect + Technical PM + Architecture Gatekeeper (Mventor performs this review function within its review/lead duties). Mventor = Executor/Implementer. Human = Final Architecture Authority. Never reverse these roles. Stored verbatim from human-owner paste (duplicate paste trimmed) for session-independent continuation. Update only: current commit, completed ticket, architectural state, next approved ticket, accepted decisions, blockers — never rewrite history.

## Current state pointers (keep fresh)
- Repo: https://github.com/mventor-git/odv · main @ 52a6238 (pushed) + tickets 013-015 UNCOMMITTED (commit only on explicit order)
- DB: v37 · 21 foundation tables; enforcement LIVE: SD+IR transitions (013), audit triggers/emission/reads (008-013), identity API + resolver + typed attribution (014), materials chain E1-E6 (015)
- Last Mventor tickets: 015 Materials Enforcement (v37 append-only triggers, physical balance rule, evidence project-match, derived stage/remaining; 36-check mega + upgrade/reopen probes) · 014 Identity Enforcement (1:1 users↔persons links, resolver with derived windows, guarded CRUD incl. revokes; 34-check probe) · 013 Transition Enforcement (category rules honoured) · 012 · 011
- Next per §21: 016 End-to-End Construction Vertical Slice (Requirement→…→Audit demonstrated on the real chain) — on human order only
- Accepted during 013-015: coarse admin-tier transition gating is interim debt (014+ refine to role_assignments); scans.ts ingest stays global-only; lot.status column retained for compatibility only (events are the truth); WIR-as-category flagged OPEN (IR covers inspections meanwhile)
- Not yet approved: dual-write/cutover · AI/MCP · distributed sync · broad UI

# 1. PROJECT
ODV — construction-first Project Operating System; NOT a generic accounting ERP.
Core idea: connect what was promised, assigned, done, submitted, approved — and what proves it.
Users: Owner, Consultant, Contractor, project staff, DC, site teams, HQ, QA/QC, Planning, Commercial/QS, external labs/suppliers where authorized.

# 2. CORE BUSINESS MODEL
CONTRACT/SCOPE → REQUIREMENT → ASSIGNMENT → EXECUTION → TASK/LOT → TRANSACTION/REQUEST/INSPECTION/TEST → REVIEW/DECISION → EVIDENCE → AUDIT → COMPLETION/HANDOVER
- Requirement: what must be accomplished/provided per contract/scope/rules.
- Assignment: who is responsible for a scope slice.
- Task: operational instruction/work item to a person/team/org.
- ExecutionLot: partition of physical/operational work scope.
- Case: higher-level context grouping related activity.
- Submission/Request: formal transaction proving a workflow step.
- Inspection/Test: real-world verification.
- Evidence: proof supporting action/decision/quantity/status/completion.
- Audit: immutable record of what happened, who acted, when.

# 3. BUSINESS RULE
Consultant does NOT decide request count. Consultant defines scope, work, requirements, deliverables, evidence requirements, dates, rules, workflows. Request count emerges from execution (example chain: Survey -> SD -> MIR -> IR/WIR -> CBR -> Lab -> QS -> Form Removal -> Handover). Model the chain without assuming fixed request counts.

# 4. ORGANIZATION MODEL
Organizations are sovereign: Owner, Consultant, Contractor, External. Each controls its own employees, internal roles, assignments, policies, AI config, operations. No cross-org employee management. Project = collaboration/governance context. "Contractor + Consultant = Project" is NOT the ontology — projects hold multiple consultants/contractors/external participants.

# 5. SCOPE OWNERSHIP
ScopeAssignment is the responsibility model, NOT cluster ownership. Contractor may own one/part/multiple clusters, disciplines, buildings, time-bounded scope; extend/release/hand scope. Contractor A may leave; B inherits; project continues; history stays attributed to original responsible org.

# 6. CLUSTER
Cluster = project partition, NOT an organization. Never duplicate an org per cluster. Legacy cluster coupling (plain cluster_code) treated carefully: evidence-driven migration only, no destructive cleanup.

# 7. CONSULTANT
Consultant HQ: workforce, portfolio, project setup, assignments. Project Setup/Compiler creates the project protocol/package (contract, BOQ, drawings, schedules, specs, scopes, requirements, deliverables, workflow rules, templates, mappings, references). Defined once; protocol versioned; historical versions preserved. Consultant DC = Information Flow Operator, not automatic Technical Approver.

# 8. CONTRACTOR
Contractor HQ: employees, internal roles, project teams, scope assignments, DC, delegation, workload, production. Contractor receives only its authorized scope/package and internally decides who prepares/checks/submits/works. Contractor DC: register, validate, route, transmit, track, print/scan when required, archive — never silently technical approver.

# 9. OWNER
Owner = real product surface (private/developer/government): portfolio, project status, packages, scope, verified progress, quality, delays, exceptions, material evidence, quantity/commercial evidence, handover, closeout archive. No daily engineering assignment. Owner sees truth vs contract with evidence behind claims; may issue Owner Instructions into governed workflow.

# 10. SITE / HQ / DISTRIBUTED
Not LAN-only. Local-first + server/cloud capable + offline capable + distributed organizations. Site = local operational node; HQ support via governed support mode. Sync at domain-event/transaction level, NOT raw DB copying. States: online/intermittent/offline/syncing/conflict/recovery. Future concepts: outbox, inbox, event IDs, ordering, acks, retries, conflicts, authoritative state, org visibility.

# 11. SUPPORT MODE
No impersonation. Preserve: acting operator, original actor, reason, target, time, action, result. Support facts = append-only audit facts. Do NOT create redundant support_acts table if audit_events represents it.

# 12. LEGAL / EVIDENCE
DB state alone is not legal evidence. Needs: identity, audit trail, integrity hashes, trusted timestamps where required, signatures/seals where legally required, evidence exports, archives. Official history never silently rewritten — explicit lifecycle states: superseded, voided, withdrawn, corrected, canceled, archived. Signatures only for high-value official/contractual actions, not every click.

# 13. AI PRINCIPLES
ODV operates without AI. AI optional, org-controlled (none / BYOK / company-managed / local). Governed MCP/tools, classes: READ, ANALYZE, PREPARE, ACT. May: rewrite professionally, extract, classify, summarize, detect missing info, prepare requests/documents, suggest assignments, detect exceptions, automate repetition. Must NOT invent: contract facts, quantities, dates, identities, approvals, technical/legal decisions. AI is not the disciplinary/legal judge.

# 14. MATERIAL / RESOURCE
Evidence-bearing operational entities: MaterialDefinition, MaterialLot, Purchase, Receipt, Delivery, Inspection, Storage, Transfer, Consumption, Return, Waste, Evidence. Genealogy: supplier/source -> lot -> receipt -> MIR -> storage/transfer -> consumption -> work/CBR -> evidence (ready-mix plant, delivery tickets, cube samples, lab 7D/28D, disposition/NCR). Lab may be external with limited authorization. Owner-supplied vs contractor-supplied distinguishable. Not an accounting ERP.

# 15. VAULT / STORAGE
Distinguish Working Data, Official Record, Evidence, Backup, Export, Legal Archive (Backup != Export != Legal Archive). Stable logical identity, path-independent. Site storage: config, DB, vault, attachments, generated artifacts, backups, exports, logs. Vault = project memory/evidence.

# 16. PROJECT PACKAGE / ENROLLMENT
Consultant publishes versioned Project Protocol (manifest, project, scope, packages, clusters, buildings/zones, BOQ, requirements, deliverables, schedule, workflows, permissions, templates, mappings, references). Enrollment: secure endpoint -> verify -> accept -> receive authorized scope. Protocol changes versioned.

# 17. REPOSITORY FOUNDATION STATUS
DB v37; 21 additive foundation tables; legacy records() live; tables NOT universal source of truth. Do not assume new tables drive every API.

# 18. COMPLETED MVENTOR TICKETS
001 org/project foundation · 002 requirements/execution_lots · 003 cases/tasks · 004 submissions/evidence · 005 lifecycle design via existing domain_transitions (no duplicate table) · 006 scenario gate (concrete chain, responsibility, handover, support semantics) · 007 identity foundation · 008 audit_events + append-only triggers · 009 materials defs/lots/events + evidence link, dual supply · 010 support proof on audit infrastructure (no support_acts) · 011 fail-safe audit emission on record mutations · 012 admin audit reads (200/401/403 + filters) · 013 category-scoped transition enforcement SD+IR (requires_admin/requires_due_date honoured, allowed+denied audits, non-seeded categories byte-identical, due_date persistence fixed) · 014 identity enforcement API (users-persons links, resolver with derived windows, guarded CRUD, revoke-never-delete, typed audit attribution) · 015 materials chain enforcement (append-only events, physical balance rule, evidence project-match, derived stage/remaining, typed audits)

# 19. HONEST STATE
FOUNDATION GREEN — enforced for: transitions (SD+IR), audit chain, identity API, materials chain. NOT enforced/gated: sessions (legacy tier interim; records lack project context), submissions-domain transitions, materials UI, cutover, sync, AI. Never confuse "table exists" with "domain behavior enforced."

# 20. LEGACY CUTOVER RULE
records() stays live; migration/dual-write only with architectural approval after this document's updates.

# 21. ROADMAP
013 Transition Enforcement — DONE · 014 Identity/Membership/Assignment enforcement — DONE (API-side; session gate waits for migration/018) · 015 Material-Lot/Resource chain enforcement — DONE · 016 End-to-End vertical slice (Requirement→Assignment→Lot→Task→SD/MIR/IR→CBR→Lab→Evidence→Decision→Audit) · 017 Foundation regression + performance gate · 018 Dual-Write — ONLY after explicit human approval · 019 Project Protocol/Enrollment — needs human decisions (package shape, hosting) · 020 Distributed Sync — needs human decision (trust/transport) · 021 Product Surfaces — after domain semantics stabilize · 022 AI/MCP — last; optional

# 22. RULES FOR FUTURE TICKETS
1 new migration = new numbered version; SCHEMA + programmatic branch pattern; never ALTER legacy; additive; data-as-rules where the registry supports it; probes removed after run; commit/push only on explicit order; docs sync every ticket (this pointer block = the canonical state).

# 23. OPEN HUMAN DECISIONS
dual-write approval (20) · WIR as category or IR-covered (this ticket: IR covers) · Protocol package schema (before 19) · sync transport/trust model (before 20) · hosting: client-local-only vs centralized consultant endpoint · payment/commercial module scope.

# 24. HOW TO REVIEW A MVENTOR REPORT
1 check claimed commit/branch state · 2 read the actual git diff · 3 run typecheck+smoke · 4 check each AC against ticket + probes · 5 re-check regressions vs legacy records paths · 6 classify: PASS / REWORK / BLOCKED / PARTIAL / ARCHITECTURAL ISSUE · 7 one next action only — never ten tickets.

# 25. HANDOFF STATE (end of doc — keep in sync with the top pointer block)
Committed+pushed: tickets 001-012 @52a6238. Uncommitted in working tree: 013+014+015 (schema v35+v36+v37, audit attribution, transition+identity+materials enforcement, docs memory). Current schema: v37. DB version constant: CURRENT_VERSION=37. Migration list ends at {37}. Architecture status: FOUNDATION GREEN — enforcement slices 013/014/015 live at the API; vertical proof (016) next.
