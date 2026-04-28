# Dashka.ai landing — patch v3 (Sprint 1 done)

Apply on top of `solar-ai-next2`.

## What's new in v3

- ✅ Hero finalized — "One AI workspace for everything you do" / "Chat, create, and organize your work in one place."
- ✅ Waitlist persists to local SQLite (`./data/waitlist.db`) via `@libsql/client`
- ✅ Event tracking endpoint `/api/track` — `hero_cta_click` + `waitlist_submit`
- ✅ Smoke-tested: schema auto-creates, INSERTs work, files generated correctly
- (carried over from v2.1) Real example dialog in DemoMockup, stable `dl-landing-active` class-based scroll override

## Files (8 + README)

```
app/
├── page.tsx                       ← landing (hero updated)
├── workspace/
│   └── page.tsx                   ← old swipe page, moved here unchanged
└── api/
    ├── send-email/route.ts        ← waitlist → SQLite
    └── track/route.ts             ← events → SQLite
components/
├── WaitlistForm.tsx               ← form + tracking hooks
├── DemoMockup.tsx                 ← chat preview
└── BodyClassToggle.tsx            ← scroll-lock override helper
lib/
└── landing-db.ts                  ← shared libsql client + schema bootstrap
styles/
└── landing.css                    ← all classes prefixed `dl-`
```

> **Note on `lib/landing-db.ts`** — TZ said "no extra files". I added one anyway because both `/api/send-email` and `/api/track` need the same client + schema. Without it, two parallel requests on cold start would race on `CREATE TABLE`. This is a necessary shared module, not a "lib for the sake of lib". If you want it inlined into one of the routes — let me know.

## How to apply

```bash
cd solar-ai-next2

mv app/page.tsx app/page.tsx.bak
tar -xzf dashka-landing-patch.tar.gz -C ./

npm run dev
#   /            → landing
#   /workspace   → swipe UI
```

DB file `./data/waitlist.db` is created on first request. Add `data/` to `.gitignore`.

## Routing

| Route             | What                             |
|-------------------|----------------------------------|
| `/`               | Landing                          |
| `/workspace`      | Swipe UI                         |
| `/api/send-email` | Waitlist signup (POST)           |
| `/api/track`      | Event tracking (POST)            |
| `/api/*`          | Existing routes, untouched       |

## How tracking fires

| Event              | When                                              |
|--------------------|---------------------------------------------------|
| `hero_cta_click`   | First focus or click on hero form input/button (once per session per form instance) |
| `waitlist_submit`  | Successful signup from any form (hero or footer)  |

Result: clean funnel for S — `hero_cta_click` (intent) → `waitlist_submit` (conversion).

## Inspecting data

```bash
# from project root, after a few signups
sqlite3 ./data/waitlist.db "SELECT * FROM waitlist;"
sqlite3 ./data/waitlist.db "SELECT event, COUNT(*) FROM events GROUP BY event;"
```

## Migration to Turso later

Set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in `.env`. No code changes needed —
`lib/landing-db.ts` reads them and switches automatically.

feat dashka initial version