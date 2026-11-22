# Browser smoke test

Clicks through every page and the main workflows (register customer, booking wizard, payment, partial payment + reversal,
over-payment refusal, schedule editor, expense, bulk plots, transfer dues check, reservation, backup, mobile layout, viewer permissions).

Run against a server loaded with demo data (`npm run seed:demo`), on port 4000:

```
cd tests/e2e
npm install puppeteer-core
node smoke.js        # edit executablePath in smoke.js to your Chrome/Edge path
```
