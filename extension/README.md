# Maple MPSS LinkedIn Capture (Chrome extension)

Reads messages LinkedIn's own page has already loaded and sends them to the local dashboard. It never sends, clicks or types on LinkedIn.

## Build and load

1. `npm install` then `npm run build` in this folder. Output: `dist/`.
2. Chrome: `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, choose `dist/`.
3. Click the extension icon, then **Options**. Set App URL `http://localhost:3000` and paste the ingest token (dashboard, Settings, "Show ingest token").
4. Open a thread at linkedin.com/messaging or linkedin.com/sales/inbox. The popup shows messages read and the queue.

After changing code, run `npm run build` and press the reload icon on the extension card.

## Saving a real sample for the parser tests

All LinkedIn-specific parsing is in `src/parsers/`. The fixtures in `fixtures/` are synthetic. To add a real one:

1. Open a thread, press F12, go to **Network**, tick **Fetch/XHR**, reload the page.
2. Filter for `messengerMessages`, `messengerConversations` or `sales-api`. Click the response, **Response** tab, copy it.
3. Save as `fixtures/real-classic.json` (or `real-salesnav.json`). Replace real names and message text with fake ones first.
4. For the page-text fallback, right-click the thread, **Save as** "Webpage, HTML only", to `fixtures/real-classic.html`, then redact it the same way.
5. Add a test beside the existing ones in `tests/parsers.test.ts` and adjust the parser until it passes.

## Tests

`npm test` runs the parser, DOM fallback and offline-queue tests.
