# TenderWatch — Ottawa Region
## Deployment Guide (No Terminal Required)

Everything in this guide is done through your browser.
No command line, no installs, no Wrangler.

Total time: approximately 30–45 minutes on first setup.

---

## Overview — What you're deploying

| Part | What it does | How you deploy it |
|---|---|---|
| Frontend dashboard | The website you open in your browser | GitHub → Cloudflare Pages (same as your other projects) |
| 3 scraper workers | Automatically fetch tenders every morning | Cloudflare dashboard — paste & click |
| KV storage | Stores scraper results between runs | Cloudflare dashboard — one click to create |

---

## Before you start

You need:
- Your Cloudflare account login
- Your GitHub account login
- The `ottawa-tenders.zip` file extracted on your computer

---

## Step 1 — Create your GitHub repository

1. Go to **github.com** and sign in
2. Click the **+** button (top right) → **New repository**
3. Name it `ottawa-tenders`
4. Leave all other settings as default
5. Click **Create repository**
6. On the next screen, click **uploading an existing file**
7. Drag and drop the entire extracted `ottawa-tenders` folder contents into the upload area
8. Scroll down and click **Commit changes**

Your repo should now show all the folders: `frontend/`, `workers/`, `wrangler.toml`, `README.md`

---

## Step 2 — Deploy the frontend dashboard (Cloudflare Pages)

This is the same process you've used before:

1. Go to **dash.cloudflare.com**
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** → **Pages** → **Connect to Git**
4. Select your `ottawa-tenders` repository
5. Set the build configuration:
   - **Framework preset**: None
   - **Build command**: *(leave completely blank)*
   - **Build output directory**: `frontend`
6. Click **Save and Deploy**

✅ Your dashboard is now live at something like `ottawa-tenders.pages.dev`
Write down this URL — you'll use it to access TenderWatch.

---

## Step 3 — Create the KV storage namespace

The KV namespace is a simple database where scraped tenders are saved.
You create it once and all 3 workers share it.

1. In the Cloudflare dashboard, click **Workers & Pages** in the left sidebar
2. Click **KV** in the top navigation tabs
3. Click **Create a namespace**
4. In the name field type: `TENDERS_KV`
5. Click **Add**
6. You'll see your new namespace appear in the list with an **ID** next to it
7. **Copy that ID and paste it somewhere** (Notepad, a sticky note, anywhere) — it looks like: `a1b2c3d4e5f6...`

---

## Step 4 — Deploy Worker 1 (bids&tenders scraper)

This worker scrapes all 14 bids&tenders.ca subdomains.

1. In the Cloudflare dashboard → **Workers & Pages** → **Create**
2. Click **Create Worker**
3. Name it exactly: `ottawa-tenders-bidsandtenders`
4. You'll see a code editor with some sample code — **select all of it and delete it**
5. Open the file `workers/worker-bidsandtenders.js` from your extracted zip in TextEdit
6. Press **Cmd+A** to select all, **Cmd+C** to copy, then paste into the Cloudflare code editor
7. **Important:** Look for a small dropdown near the top of the editor that says **"Service Worker"** — click it and change it to **"ES Module"**. This must be set before deploying.
8. Click **Deploy**

**Now connect it to KV storage:**

8. You should now be on the worker's overview page. Click **Settings** tab
9. Click **Bindings** → **Add binding**
10. Select **KV Namespace**
11. Set **Variable name** to: `TENDERS_KV`
12. Select your `TENDERS_KV` namespace from the dropdown
13. Click **Save**

**Now set the daily schedule:**

14. Click the **Triggers** tab
15. Click **Add Cron Trigger**
16. Enter: `0 11 * * *`  *(this runs every day at 6:00 AM Ottawa time)*
17. Click **Add Trigger**

✅ Worker 1 is deployed and scheduled.

---

## Step 5 — Deploy Worker 2 (Biddingo scraper)

This worker scrapes City of Kingston and Township of South Frontenac.

1. In the Cloudflare dashboard → **Workers & Pages** → **Create**
2. Click **Create Worker**
3. Name it exactly: `ottawa-tenders-biddingo`
4. Select all sample code and delete it
5. Open `workers/worker-biddingo.js`, copy all the text, paste it into the editor
6. Click **Deploy**

**Connect to KV storage:**

7. Click **Settings** → **Bindings** → **Add binding**
8. Select **KV Namespace**
9. Set **Variable name** to: `TENDERS_KV`
10. Select your `TENDERS_KV` namespace
11. Click **Save**

**Set the daily schedule:**

12. Click **Triggers** → **Add Cron Trigger**
13. Enter: `15 11 * * *`  *(6:15 AM Ottawa time — staggered slightly from Worker 1)*
14. Click **Add Trigger**

✅ Worker 2 is deployed and scheduled.

---

## Step 6 — Deploy Worker 3 (municipal websites scraper)

This worker scrapes the 17 municipalities that post tenders on their own websites.

1. In the Cloudflare dashboard → **Workers & Pages** → **Create**
2. Click **Create Worker**
3. Name it exactly: `ottawa-tenders-municipal`
4. Select all sample code and delete it
5. Open `workers/worker-municipal.js`, copy all the text, paste it into the editor
6. Click **Deploy**

**Connect to KV storage:**

7. Click **Settings** → **Bindings** → **Add binding**
8. Select **KV Namespace**
9. Set **Variable name** to: `TENDERS_KV`
10. Select your `TENDERS_KV` namespace
11. Click **Save**

**Set the daily schedule:**

12. Click **Triggers** → **Add Cron Trigger**
13. Enter: `30 11 * * *`  *(6:30 AM Ottawa time — staggered from Workers 1 and 2)*
14. Click **Add Trigger**

✅ Worker 3 is deployed and scheduled.

---

## Step 7 — Find your worker URLs

Each deployed worker has a URL. You need these to connect the dashboard to the scrapers.

1. In the Cloudflare dashboard → **Workers & Pages**
2. Click on `ottawa-tenders-bidsandtenders`
3. At the top you'll see a URL like:
   `https://ottawa-tenders-bidsandtenders.YOURNAME.workers.dev`
4. Copy it and write it down
5. Go back and repeat for `ottawa-tenders-biddingo` and `ottawa-tenders-municipal`

You should now have 3 URLs written down, one for each worker.

---

## Step 8 — Connect the dashboard to your workers

Now you need to paste your 3 worker URLs into the frontend code.

1. Go to your GitHub repo (`github.com/YOURNAME/ottawa-tenders`)
2. Click into the `frontend` folder
3. Click on `app.js`
4. Click the **pencil icon** (Edit this file) in the top right of the file view
5. Near the top of the file, find this section:

```javascript
const WORKER_URLS = {
  bidsandtenders: 'https://ottawa-tenders-bidsandtenders.YOUR_SUBDOMAIN.workers.dev',
  biddingo:       'https://ottawa-tenders-biddingo.YOUR_SUBDOMAIN.workers.dev',
  municipal:      'https://ottawa-tenders-municipal.YOUR_SUBDOMAIN.workers.dev',
};
```

6. Replace each URL with the actual URLs you wrote down in Step 7
7. Scroll down and click **Commit changes**

Cloudflare Pages will automatically redeploy your dashboard within about 60 seconds.

---

## Step 9 — Test everything

1. Open your dashboard URL from Step 2 (e.g. `ottawa-tenders.pages.dev`)
2. Click the **Refresh** button in the top right corner
3. Wait about 10–15 seconds
4. Tenders should start appearing, sorted by relevance

**If you don't see tenders after 30 seconds:**
- Make sure the worker URLs in `app.js` are correct (Step 8)
- Go to Cloudflare dashboard → Workers → click a worker → **Logs** tab to see if there are any errors
- Try clicking the Refresh button again

---

## Step 10 — Set up email digest (optional)

To receive a daily email summary of new tenders, you'll need a free account with Resend (resend.com) — a simple email API.

1. Sign up at **resend.com** (free tier is sufficient)
2. Go to **API Keys** and create a new key — copy it
3. In the Cloudflare dashboard → **Workers & Pages** → click `ottawa-tenders-bidsandtenders`
4. Click **Settings** → **Variables**
5. Under **Environment Variables**, click **Add variable** and add each of these:

| Variable name | Value |
|---|---|
| `DIGEST_EMAIL_TO` | your@email.com |
| `DIGEST_EMAIL_FROM` | onboarding@resend.dev *(Resend's free sending address)* |
| `RESEND_API_KEY` | the API key you copied |

6. Click **Save and Deploy**

You'll receive an email each morning after the 6:00 AM scrape with new tenders found since the previous day.

---

## Day-to-day use

**Your dashboard runs automatically** — every morning at 6:00–6:30 AM the workers run and refresh the data. Just open the URL and it's up to date.

**The Refresh button** in the top right lets you trigger a manual scrape anytime — useful if you've heard a tender might have just been posted.

**Dismissing tenders** — click Dismiss on any tender that's not relevant. It moves to a collapsed section at the bottom. Your dismiss choices are saved in your browser.

**Adding a new municipality** is done entirely through GitHub:
1. Go to your repo → `workers/shared/municipalities.js`
2. Click the pencil icon to edit
3. Add the new municipality to the appropriate list
4. Commit — done. The workers pick it up automatically on the next run.

---

## Troubleshooting

**"No tenders found" after clicking Refresh**
Workers take 10–20 seconds to finish running. Wait a moment then reload the page.

**CORS error in browser console (F12)**
The worker URLs in `app.js` don't match your actual deployed worker URLs. Re-check Step 8.

**A specific municipality shows no results**
That site's HTML structure may differ from what the scraper expects. This is normal on first deployment — note which ones aren't working and they can be tuned individually.

**Workers not running at 6 AM**
Check the Triggers tab on each worker in the Cloudflare dashboard to confirm the cron was saved correctly.

**Upgrading to the paid Workers plan ($5/month)**
When you're ready: Cloudflare dashboard → Workers & Pages → Plans → Purchase Workers Paid.
No code changes needed — everything just gets more headroom.

---

*Built for the Ottawa region transportation engineering and planning industry.*
