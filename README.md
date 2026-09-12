# odv — Open-Source Construction Document Control & Inspection System

![Node 22+](https://img.shields.io/badge/Node-22%2B-green) ![React 19](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue) ![License MIT](https://img.shields.io/badge/License-MIT-yellow)

Local-first, LAN-ready document control: requests, inspections, submittals, checklists, Excel automation, bilingual EN/AR RTL. No private data — ships with neutral demo placeholders.

## Key Features
- Full request lifecycle (IR, RFI, NCR, Submittals, Checklists, CBR)
- Bilingual English / Arabic with native RTL and Cairo typography
- Local-first & LAN ready (SQLite with FTS5 search, WAL backups, trash audit)
- Excel template automation & smart PDF collator (Windows + Excel for COM fill; friendly fallback elsewhere)
- First-run Setup Wizard (company, project, logos) + demo placeholders for testing/showing

## Quickstart
```bash
git clone https://github.com/mventor-git/odv.git
cd odv
npm run install:all
npm run dev
```

Open `http://localhost:8050`. On first run the Setup Wizard configures company/project. Demo roles (Civil Lead, Site Engineers, QA/QC, Document Controller) are seeded — replace them in Settings.

## Structure
```
client/   # React 19 + Vite + Tailwind UI
server/   # Express + node:sqlite API (src/, test/smoke.mjs)
data/     # runtime only (gitignored): pdfs/, vault/, work/, backups/
scripts/  # maintenance helpers
```

## Config
Copy `server/.env.example` to `server/.env` (JWT_SECRET auto-generates if omitted). `PORT` defaults to 8050. Excel COM fill needs Windows + Microsoft Excel.

## Verify
```bash
npm --prefix server run typecheck
npm --prefix client run build
npm --prefix server run smoke
```

## License
MIT — see `LICENSE`.
