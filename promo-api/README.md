# Hearing Assistant promo codes

Small Cloudflare Worker that hands out Google Play promo codes for the Facebook giveaway. The website page is `/free-code/`. This folder is the API only.

**Do not put real codes in this repo.** The GitHub repo and GitHub Pages site are public. Codes stay in a private CSV on your computer, outside the project folder. `.gitignore` ignores `*promo-codes*.csv`. The Worker stores a salted hash of the IP and of the device id. It does not store the raw IP.

Each code is given out once. A later request from the same device **or** the same IP gets that same code again (a refresh shows it again). People on the same Wi-Fi, or behind the same mobile-carrier address, share one code. That is the one-per-IP rule. Google Play promo codes usually redeem once, so a second person on that network will see a code that may already be used.

## What you need

- A Cloudflare account (the free plan covers Workers and D1 for 400 rows)
- Node.js 20 or newer
- The private CSV: one column, header exactly `Promotion code`, one code per row

## Deploy

Run these from the `promo-api` folder.

1. Log in:

   ```bash
   npx wrangler login
   ```

2. Create the database:

   ```bash
   npx wrangler d1 create hearing-promo
   ```

   Copy the `database_id` it prints into `wrangler.toml`, replacing `00000000-0000-0000-0000-000000000000`.

3. Create a long random salt and store it as a secret. It never goes in git. Wrangler will ask you to paste it.

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put HASH_SALT
   ```

4. Create the tables:

   ```bash
   npx wrangler d1 execute hearing-promo --remote --file=schema.sql
   ```

5. Put the CSV **outside** this repo, then load it. The script prints how many codes it parsed. It does not print the codes. `--remote` writes to the live database.

   ```bash
   node scripts/import-codes.mjs --remote /full/path/outside/this/repo/promo-codes.csv
   ```

   Confirm the count it prints is 400. Running the import again is safe: existing codes are skipped, not duplicated.

6. Deploy:

   ```bash
   npx wrangler deploy
   ```

   Copy the `https://hearing-assistant-promo.<your-subdomain>.workers.dev` URL. No trailing slash.

7. Open `free-code/index.html` in the site repo. Set the constant at the top of the page script:

   ```javascript
   const PROMO_API_BASE = "https://hearing-assistant-promo.<your-subdomain>.workers.dev";
   ```

8. Commit that one line and push to `main`. GitHub Pages publishes the site from `main`.

   Until `PROMO_API_BASE` is set, https://hearingassistant.app/free-code/ stays in **demo mode**. The yellow banner says `Preview: demo codes only` and the code is fake (`DEMO-1234-ABCD`). Do not share the Facebook post until that banner is gone.

9. Check the live page on your phone. The banner should be gone. Tap **Get my free code**. Tap it again and confirm you see the same code. This uses up one real code.

   ```bash
   curl https://hearing-assistant-promo.<your-subdomain>.workers.dev/status
   ```

   That prints the remaining count and nothing else.

## Try it on your machine first

Use fake codes only.

```bash
cd promo-api
npm install
npm test
cp .dev.vars.example .dev.vars
printf '%s\n' 'Promotion code' 'FAKE-0001' 'FAKE-0002' > /tmp/fake-promo-codes.csv
npx wrangler d1 execute hearing-promo --local --file=schema.sql
node scripts/import-codes.mjs /tmp/fake-promo-codes.csv
npx wrangler dev
```

`wrangler dev` prints a local URL. Point `PROMO_API_BASE` at that URL to test the page against the local Worker. `http://localhost` is allowed by CORS. The public site origin `https://hearingassistant.app` is allowed. Other websites are not.

`node scripts/import-codes.mjs --dry-run /tmp/fake-promo-codes.csv` checks the file and prints a count. It does not load anything.

## API

| Request | Result |
| --- | --- |
| `GET /status` | Remaining count, digits only. Example: `400` |
| `POST /claim` | JSON body `{ "deviceId": "<uuid>", "elapsedMs": 2000 }`. Success: `{ "code", "repeat" }`. Sold out: `409` `{ "error": "sold_out" }`. |
| `OPTIONS` | CORS preflight for the allowlist |

`elapsedMs` must be at least `MIN_ELAPSED_MS` (1500). A quicker call gets `{ "error": "too_fast" }` and does not use a code. The page sends how long it has been open.

The claim is one SQLite statement:

```sql
UPDATE codes
SET claimed_at = ?, device_hash = ?, ip_hash = ?
WHERE id = (SELECT id FROM codes WHERE claimed_at IS NULL ORDER BY id LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM codes AS taken
    WHERE taken.device_hash = ? OR taken.ip_hash = ?
  )
RETURNING code;
```

D1 runs that statement on its own. Two requests cannot take the same row.

## Tests

`npm test` uses fake `FAKE-0001` style codes in an in-memory SQLite database. It checks concurrent claims, the same device, the same IP, sold out, `/status`, CORS, and that the raw IP is not stored.
