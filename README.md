# Cheatle

This app uses Next.js static export so it can be hosted on GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

## Build static site

```bash
npm run build
```

The exported static site is generated in `out/`.

## GitHub Pages deployment

Deployment is automated via GitHub Actions in `.github/workflows/deploy.yml`.

Required one-time repository settings:

1. In GitHub, open **Settings -> Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main` (or manually run the workflow) to deploy.

The workflow computes the correct base path for both project pages and user/organization pages.
