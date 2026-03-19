# TenderWatch — Ottawa Region
## Deployment Guide

This guide walks you through deploying TenderWatch from scratch.
Total time: approximately 20–30 minutes on first setup.

---

## What you're deploying

| Part | What it does | Where it runs |
|---|---|---|
| Frontend dashboard | The website you open in your browser | Cloudflare Pages (same as your other projects) |
| 3 scraper workers | Automatically fetch tenders daily | Cloudflare Workers |
| KV storage | Stores scraper results between runs | Cloudflare KV (free, included) |

---

## Prerequisites

You need:
- A Cloudflare account (free)
- A GitHub account
- Node.js installed on your computer (download from nodejs.org if needed)

---

## Step 1 — Create your GitHub repository

1. Go to github.com and create a new repository called `ottawa-tenders`
2. Upload all the files from this project (drag and drop the folder)
3. Make sure the repo structure looks like this:
   ```
   ottawa-tenders/
   ├── frontend/
   │   ├── index.html
   │   ├── style.css
   │   └── app.js
   ├── workers/
   │   ├── shared/
   │   │   ├── municipalities.js
   │   │   └── keywords.js
   │   ├── bidsandtenders/
   │   │   └── index.js
   │   ├── biddingo/
   │   │   └── index.js
   │   └── municipal/
   │       └── index.js
   ├── wrangler.toml
   └── README.md
   ```

---

## Step 2 — Deploy the frontend (Cloudflare Pages)

This is identical to how you've deployed other sites:

1. Log in to dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** → **Pages** → **Connect to Git**
4. Select your `ottawa-tenders` repository
5. Set the build configuration:
   - **Framework preset**: None
   - **Build command**: (leave blank)
   - **Build output directory**: `frontend`
6. Click **Save and Deploy**

Your dashboard will be live at something like `ottawa-tenders.pages.dev`

---

## Step 3 — Create the KV namespace

The KV store is where scraped tenders are saved. Create it once, used by all 3 workers.

1. In the Cloudflare dashboard, go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it: `TENDERS_KV`
4. Click **Add**
5. **Copy the Namespace ID** — you'll need it in the next step

---

## Step 4 — Update wrangler.toml with your KV ID

Open `wrangler.toml` and replace all three instances of:
```
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
```
with the Namespace ID you copied in Step 3.

Commit and push this change to GitHub.

---

## Step 5 — Install Wrangler CLI (one time only)

Open Terminal (Mac) or Command Prompt (Windows) and run:

```bash
npm install -g wrangler
```

Then log in to your Cloudflare account:

```bash
wrangler login
```

This will open a browser window — click **Allow** to authorize.

---

## Step 6 — Deploy the 3 workers

In Terminal, navigate to your project folder:

```bash
cd path/to/ottawa-tenders
```

Deploy each worker:

```bash
wrangler deploy --config wrangler.toml --name ottawa-tenders-bidsandtenders --script workers/bidsandtenders/index.js
wrangler deploy --config wrangler.toml --name ottawa-tenders-biddingo --script workers/biddingo/index.js
wrangler deploy --config wrangler.toml --name ottawa-tenders-municipal --script workers/municipal/index.js
```

You'll see output like:
```
✅ Successfully deployed to ottawa-tenders-bidsandtenders.yourname.workers.dev
```

**Copy the 3 worker URLs** — you'll need them in Step 7.

---

## Step 7 — Update the frontend with your worker URLs

Open `frontend/app.js` and find this section near the top:

```javascript
const WORKER_URLS = {
  bidsandtenders: 'https://ottawa-tenders-bidsandtenders.YOUR_SUBDOMAIN.workers.dev',
  biddingo:       'https://ottawa-tenders-biddingo.YOUR_SUBDOMAIN.workers.dev',
  municipal:      'https://ottawa-tenders-municipal.YOUR_SUBDOMAIN.workers.dev',
};
```

Replace `YOUR_SUBDOMAIN` in each URL with the actual subdomain from your worker URLs in Step 6.

Save the file, commit, and push to GitHub. Cloudflare Pages will auto-redeploy.

---

## Step 8 — Set up email digest (optional but recommended)

The workers can send you a daily email digest of new tenders. This requires a free email API.

**Recommended: Resend (resend.com) — easiest setup, generous free tier**

1. Sign up at resend.com (free)
2. Create an API key
3. In the Cloudflare dashboard → **Workers & Pages** → select `ottawa-tenders-bidsandtenders`
4. Go to **Settings** → **Variables**
5. Add these environment variables:
   - `DIGEST_EMAIL_TO` = your@email.com
   - `DIGEST_EMAIL_FROM` = tenders@yourdomain.com (or use Resend's free domain)
   - `RESEND_API_KEY` = your Resend API key
6. Repeat for the other two workers (or just the bidsandtenders one — it sends the digest)

---

## Step 9 — Test everything

1. Open your Cloudflare Pages URL (from Step 2)
2. Click the **Refresh** button in the top right
3. Wait about 10 seconds
4. Tenders should start appearing

If you don't see any tenders after 30 seconds:
- Check the browser console (F12 → Console) for error messages
- Make sure the worker URLs in `app.js` are correct
- Go to Cloudflare dashboard → Workers → click a worker → **Logs** to see what happened

---

## Adding new municipalities later

To add a new municipality, just edit `workers/shared/municipalities.js`:

- If it's on bids&tenders: add a line to `BIDSANDTENDERS_SOURCES`
- If it's on Biddingo: add a line to `BIDDINGO_SOURCES`
- If it's on their own website: add a config block to `MUNICIPAL_SOURCES`

Then commit and push — the workers redeploy automatically through GitHub.

---

## Adjusting keywords

To add or remove keywords, edit `workers/shared/keywords.js`.

- `HIGH_CONFIDENCE_KEYWORDS` — shown in green as confirmed relevant
- `WORTH_A_GLANCE_KEYWORDS` — shown in amber for manual review

Commit and push to apply changes.

---

## Upgrading to the paid Workers plan ($5/month)

When ready to upgrade:

1. In Cloudflare dashboard → **Workers & Pages** → **Plans**
2. Click **Purchase Workers Paid**
3. That's it — no code changes needed

The paid plan removes the 50 subrequest limit, meaning you could consolidate the 3 workers
into 1 if desired (simpler), and adds room for many more municipalities.

---

## Troubleshooting

**"No tenders found" after refresh**
- Workers take 5–15 seconds to run — wait and refresh the page
- Check worker logs in Cloudflare dashboard

**CORS errors in browser console**
- Make sure the worker URLs in `app.js` exactly match your deployed worker URLs

**Some municipalities showing no results**
- This is normal — some sites may have changed their HTML structure
- Check the URL for that municipality manually and report so we can update the scraper

**Workers not running on schedule**
- Verify the cron triggers in `wrangler.toml` were set correctly
- In Cloudflare dashboard → Workers → your worker → **Triggers** tab

---

*Built for the Ottawa region transportation engineering and planning industry.*
