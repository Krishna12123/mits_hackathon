# FloodLens — Project Rules

> Ground rules for all development work on this project.
> Every contributor (and AI agent) must follow these before making any changes.

---

## Rule 1 — Analyse First, Ask Before Editing

**Before touching any file:**

1. **Read & understand** the file and its role in the codebase.
2. **Write out a clear plan** — what will change, why, and what might break.
3. **Ask for permission** and wait for explicit approval before making the edit.
4. Only then make the change — no surprise edits.

```
❌  Wrong:  Edit file → tell user what changed
✅  Right:  Analyse → explain plan → get approval → edit
```

> This applies to: source files, configs, environment files, database schemas, and any file
> that affects how the app runs.

---

## Rule 2 — No GitHub Push Without Permission

- **Never** run `git push`, `git push origin`, or any variant without asking first.
- Before pushing, always confirm:
  - Which branch are we pushing to?
  - Is the code tested and working?
  - Should a pull request be opened instead?
- Force pushes (`--force`) are **strictly forbidden** without explicit written approval.

```
❌  git push                         ← never do this silently
✅  "Ready to push — shall I push to 'main' or open a PR?"
```

> Same rule applies to: creating tags, merging branches, or deleting remote branches.

---

## Rule 3 — Dummy Data Must Be in a Centralised Object

When working with placeholder / mock data in the frontend, **always define it as a single
named object or array** at the top of the file (or in a dedicated `src/data/` file),
**never inline it** inside JSX or component logic.

### Why

- Real API data can replace the dummy object in one place with zero JSX changes.
- Reviewers can instantly spot what is mocked vs. real.
- Prevents stale hard-coded values scattered across components.

### Pattern to follow

```js
// ✅ src/data/settlements.js  ← single source of truth
export const MOCK_SETTLEMENTS = [
  { id: 1, name: 'Hayaghat', district: 'Darbhanga', flooded_pct: 78, severity: 'severe' },
  { id: 2, name: 'Benipur',  district: 'Darbhanga', flooded_pct: 55, severity: 'high'   },
  // ...
]

// When real API is ready, replace with:
// const { data: settlements } = useQuery({ queryKey: ['settlements'], queryFn: settlementAPI.list })
```

```js
// ❌ Wrong — data buried inside JSX, hard to swap
<table>
  { [{ name: 'Hayaghat', ... }, { name: 'Benipur', ... }].map(...) }
</table>
```

### Naming convention for mock data

| Prefix | Meaning |
|--------|---------|
| `MOCK_` | Temporary placeholder — will be replaced by API |
| `STATIC_` | Permanent static data — will NOT change (e.g. severity labels) |
| `DEFAULT_` | Default fallback values used before first API response |

### Where to put it

```
floodlens-frontend/src/
└── data/
    ├── settlements.js   ← MOCK_SETTLEMENTS
    ├── reports.js       ← MOCK_REPORTS
    ├── jobs.js          ← MOCK_RECENT_JOBS
    └── stats.js         ← MOCK_STATS, DEFAULT_SUMMARY
```

---

## Quick Reference Checklist

Before any code change, run through this:

- [ ] Analysed the file and understood its purpose
- [ ] Written out what will change and why
- [ ] Got explicit approval from the team/user
- [ ] Dummy data is defined as a named object in `src/data/`
- [ ] No `git push` without confirmation
- [ ] No force pushes under any circumstance
