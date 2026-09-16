# CHANGELOG

2026-09-12 — init: Mventor workspace (tickets/,logs/,.mventor,docs set) at 70a1233; no code change.
2026-09-12 — mventor-ticket-001: v28 additive Org/Project foundation (5 tables + migration); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-002: v29 additive Requirement/ExecutionLot (2 tables + migration, resubmit lineage); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-003: v30 additive Case/Task (2 tables + 4 indexes + migration, org-level assignment); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-004: v31 additive Submission/Evidence (2 tables + 3 indexes + migration, generic status machine, polymorphic evidence); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-005: per-type lifecycle design (data-driven transitions, legacy→generic state map, cutover strategy) + v27→v31 upgrade proof; no code change; smoke 45/45.
2026-09-12 — mventor-ticket-006 FOUNDATION GATE: 3 scenario probes OK (concrete chain, handover, DC/person boundary) + smoke 45/45; zero code change; 9-gap register; verdict FIT for next slices.
2026-09-12 — mventor-ticket-007: v32 additive identity model (persons/memberships/project-roles/assignments/delegations, derived expiry); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-008: v33 additive audit trail (audit_events + DB-level append-only triggers, programmatic migration); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-009: v34 additive material domain (defs/lots/events + evidence link, dual supply); no behavior change; smoke 45/45.
2026-09-12 — mventor-ticket-010: HQ support representation proven on audit_events (support.* mapping, no new table); no code change; smoke 45/45.
2026-09-12 — mventor-ticket-011: audit emission live (helper + 5 records hooks, fail-safe, legacy codes identical); smoke 45/45.
2026-09-12 — mventor-ticket-012: read-only admin GET /api/audit (401/403 enforced, filters); smoke 45/45.
2026-09-14 — batch commit: tickets 001-012 (schema v28-v34, audit emission + reads, memory docs).
2026-09-14 — mventor-ticket-013: category-scoped transition enforcement (domain_transitions) live for SD+IR — requires_admin/requires_due_date honoured, allowed+denied audits, non-seeded categories provably unchanged, PATCH now persists due_date (legacy drop fixed).
2026-09-14 — mventor-ticket-014: v36 users↔persons (1:1 unique) + identity resolver (derived windows) + guarded identity API (membership-required assignments, time-bounded never-self same-org delegations, revoke-never-delete, admin-gated) + typed audit attribution (person_id on legacy emits when linked; unlinked byte-identical).
2026-09-14 — mventor-ticket-015: v37 material chain enforcement — DB append-only triggers on material_events, physical balance rule (reducers can't exceed lot quantity), evidence existence + project-match guard, stage/remaining derived from event facts only, admin-gated typed audits. Migration upgrade + reopen proven; 36-check probe + stage check green.
