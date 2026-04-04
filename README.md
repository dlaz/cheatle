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

## Regenerate word frequency data

The file `app/data/word_by_frequency.json` is generated from `app/data/words.json` using NLTK corpora.

Run with the default corpus (`reuters`):

```bash
uv run utils/word_frequency_scorer.py app/data/words.json > app/data/word_by_frequency.json
```

Run with a specific corpus (example: `brown`):

```bash
uv run utils/word_frequency_scorer.py brown app/data/words.json > app/data/word_by_frequency.json
```

The output JSON contains normalized frequencies in the range `[0, 1]` for each word in the game dictionary.
