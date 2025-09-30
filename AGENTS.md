# Repository Guidelines

## Project Structure & Module Organization
- `app/` hosts the Next.js App Router: `page.js` for the landing view, `overview/` for summary segments, `rank.jsx` for the keyword dashboard, and server routes under `app/api/*`.
- `app/components` holds reusable UI, `app/context` exposes shared providers, and `app/lib` contains data utilities—keep new modules in these folders instead of nesting inside route files.
- `public/` serves static assets, while `scripts/` stores operational helpers such as `count_keywords.mjs` for CSV hygiene.
- `legacy/` preserves the earlier Apps Script flow; treat it as read-only unless you are migrating logic into the primary `app/` tree.

## Build, Test, and Development Commands
- `npm install` bootstraps dependencies (Next.js 15, React 19, Tailwind 4, Biome).
- `npm run dev` starts the Turbopack dev server at `http://localhost:3000`.
- `npm run build` compiles a production bundle and surfaces runtime issues before deployment.
- `npm run start` serves the compiled output locally; mirrors the Vercel runtime.
- `npm run lint` runs Biome checks; `npm run format` applies the canonical style.
- `node scripts/count_keywords.mjs ./app/data/source.csv` inspects keyword density prior to uploading CSVs.

## Coding Style & Naming Conventions
- Respect `biome.json`: two-space indentation, double quotes in JS/TS, and trailing commas where supported.
- Component, context, and provider files use PascalCase (`AppShell.jsx`, `RankDataProvider`), while hooks and utilities use camelCase (`useRankData`, `clampRank`).
- Prefer Tailwind utility classes; extend shared tokens via the `@theme inline` block inside `app/globals.css`.
- Keep route-specific helpers near their segment (`app/overview/*`); elevate widely used code into `app/lib`.

## Testing Guidelines
- No automated suite exists yet—introduce Jest or Vitest under `app/**/__tests__` or `tests/` and mirror route names (`rank.test.jsx`).
- Mock external services such as `RANK_QUERY_API` and sheet sync calls so tests stay deterministic.
- Document manual verification steps in PRs whenever automated coverage is unavailable, and always run `npm run lint` before review.

## Commit & Pull Request Guidelines
- Follow the existing log: concise, imperative subjects under ~65 characters (e.g., `Sync run CSV and overview adjustments`).
- Commit one logical change at a time; use bodies sparingly to note edge cases or rollout steps.
- PRs must include a summary, validation checklist, and screenshots or GIFs for UI updates.
- Reference related tickets or Sheets rows and call out environment prerequisites (`RANK_QUERY_API`, `APPS_SCRIPT_API_KEY`, expected `app/data` inputs) so reviewers can reproduce the scenario.
