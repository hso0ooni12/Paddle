# Paddle Rotation 🎾

A lightweight padel session organizer deployed on Cloudflare Workers with Static Assets.

## Architecture

- `public/index.html` — frontend.
- `src/worker.js` — API routes.
- Cloudflare D1 — persistent visitor counter.
- Cloudflare Workers Static Assets — global delivery of the frontend.
- GitHub `main` — production source branch.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run check
```

## Deployment

The project is ready for Cloudflare Workers Builds / Git integration.

- Production branch: `main`
- Build command: none required
- Deploy command: `npx wrangler deploy`
- Preview deploys: handled automatically by Cloudflare
- D1: provisioned automatically from `wrangler.jsonc` on first deployment

The frontend calls `POST /api/visitors`. The Worker keeps the same route, so no frontend migration code is required.

## Health check

`GET /api/health`

## Legacy hosting

Netlify configuration and Netlify Functions were removed during the Cloudflare migration.
