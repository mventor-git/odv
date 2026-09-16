# BACKLOG

| # | Title | Pri | Dep | Size |
|---|---|---|---|---|
| 1 | Org/Project/Participant/ScopeAssignment model | high | — | M | done (001, v28 tables, unenforced) |
| 2 | Requirement/Lot split (part 1) | high | 1 | M | done (002, v29) |
| 2b | Task/Submission/Evidence split (part 2) | high | 2 | M | done (003 cases/tasks v30; 004 submissions/evidence v31) |
| 3 | Per-type lifecycle + partial/split lineage | high | 2 | M | enforcement: SD+IR live (013, v35); remaining categories = same mechanism, data-only seeds; submissions-domain wiring pending |
| 4 | Material-lot chain + lab scoping | med | 2 | M | done (009 v34 tables; 015 v37 enforced API: append-only events, balance, evidence project-match, derived chain) |
| 5 | Enrollment + handover/closeout flows | med | 1,3 | M |
| 6 | Content-ID vault + exports | med | 2 | M |
| 7 | Event-sync outbox/inbox design | low | 1,3 | L |
| 8 | Org-scoped AI seam (optional/off) | low | — | M |
| 9 | Identity model: persons/memberships/project-roles/assignments/delegations (GAP-IDENT, PROPOSED next) | high | 1 | M | done (007 tables; 014 links+resolver+guarded API+typed audit; session gating lands with 018/dual-write) |
| 10 | Append-only audit trail (GAP-AUDIT) | high | 9 | M | done (008 table+triggers; 011 live emission on records routes) |
| 11 | HQ support/takeover audit (GAP-SUPPORT) | med | 9,10 | S | done (010: audit_events support.* mapping proven, no new table; takeover policy/UI pending) |
