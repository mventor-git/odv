# TECHNICAL_DEBT

| Problem | Reason | Impact | Fix | Pri |
|---|---|---|---|---|
| records() mixes 5 concepts | inherited | blocks org/sync/lifecycle | split (backlog #2) | high |
| clusters as projects, no org_id | inherited | no multi-org | foundation tables live (#001); enforcement + migration of reads next | high |
| permissions tables unenforced | inherited | coarse auth | enforce per-ticket | med |
| VaultPage = notifications | inherited | confusion | rename or real vault (#6) | low |
| GAP-IDENT: no person-level assignment (assignee_org_id only) | gate-proven missing | blocks accountability | identity tables live (#007); person enforcement + users-link pending | high |
| GAP-AUDIT: status changes are UPDATEs, no audit table | gate-proven missing | official-history claim unenforced | table + triggers live (#008); emission wiring pending | high |
