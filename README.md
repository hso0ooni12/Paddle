# Paddle Rotation 🎾

A premium Arabic-first padel session manager deployed on Netlify.

## Hosting

- Platform: Netlify
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Production branch: `main`
- Visitor counter: Netlify Blobs via `POST /api/visitors`

## Project structure

- `public/index.html` — application UI and client-side session logic
- `netlify/functions/visitors.mjs` — persistent visitor counter
- `netlify.toml` — deploy and security-header configuration

## Deployment

The site is designed for Git-based deployment. Pushing to `main` triggers a new Netlify production deploy when the repository is connected to the site.

No frontend build command is required.
