# Deploying the web demo on Vercel

The web demo is a static, read-only copy of the board with made-up data (see
[README: Web demo](../README.md#web-demo)). It does not run the plugin, the tracker or any server code, and it
holds no personal data. All its settings live in [`vercel.json`](../vercel.json):

| Setting | Value |
|---|---|
| Framework | none (`"framework": null`) |
| Install command | `true` (nothing to install: the build has no dependencies) |
| Build command | `node dev/build-web.mjs` |
| Output directory | `web-dist` |
| Headers | the board's Content-Security-Policy, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` |

## First deploy (Git integration)

1. Sign in at [vercel.com/new](https://vercel.com/new) and import the GitHub repository `omkar-k0/laufbahn`.
   If Vercel cannot see it, use **Adjust GitHub App Permissions** on that page to give it access.
2. Keep the root directory as the repository root. Choose the framework preset **Other**. Leave the build,
   output and install settings alone: `vercel.json` overrides them.
3. Click **Deploy**. Vercel gives the project a `*.vercel.app` address when the build finishes.

## Branches and previews

- The production branch is `main` (Project → Settings → Git → Production Branch). Every push to `main`
  updates the live site.
- Every other branch and every pull request gets its own preview deployment, and Vercel links it from the
  pull request.

## Custom domain

1. Open Project → Settings → Domains and add the domain (for example `laufbahn.example.com`).
2. Vercel shows the DNS records to create: usually an `A` record for an apex domain or a `CNAME` record for a
   subdomain. Add exactly those at your DNS provider.
3. Wait until Vercel shows the domain as valid. It issues the HTTPS certificate on its own.

## Check a build locally

```bash
node dev/build-web.mjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory web-dist
```

Then open <http://127.0.0.1:8000/>. Python's server does not send the `vercel.json` headers; Vercel does.
