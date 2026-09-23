# TNL API Scrapper

A Node.js service that keeps an up-to-date copy of Throne and Liberty potential-item prices from
[tl-tracker.com](https://tl-tracker.com/potentials) and serves it as JSON.

## How it works

- Playwright opens the tracker site in a persistent browser profile. On the first run the browser is
  visible so you can log in; later runs reuse the saved session headlessly.
- Instead of scraping the page, it captures the site's own API response and finds the main dataset
  (the largest list in the nested JSON).
- Each item is reduced to its `label`, `kind`, `listed`, `floor` and `listings` fields.
- The data refreshes in the background every 5 minutes. Until the first scrape finishes, the endpoint
  returns a `pending` status.

## Tech

Node.js, Express, Playwright

## Run

```bash
npm install
npx playwright install chromium
node index.js
```

Then open http://localhost:3000/market-potentials.

The saved login session is stored in `browser_profile/`, which is git-ignored.
