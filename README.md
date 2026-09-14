# SSMV — Backend Setup & Hosting Guide

This version of SSMV has a real backend: a Node.js server + a SQLite
database, instead of browser localStorage. That means events, albums,
photos and the members directory are now shared — anyone who opens the
site (on any device) sees the same data, and it survives clearing browser
data.

Your own sign-in session (who you are, guest vs. member) still lives only
in your own browser, as before.

## What's inside

```
ssmv-app/
├── package.json
├── server/
│   ├── server.js      ← the web server + REST API (no external packages)
│   └── db.js           ← SQLite database layer
├── public/
│   └── index.html      ← the whole frontend (one file)
└── data/
    └── ssmv.db          ← created automatically on first run — this file IS your database
```

There is nothing to `npm install` — the server only uses Node's own
built-in modules (`http`, `fs`, `path`) plus Node's built-in `node:sqlite`
module. That keeps this easy to host anywhere that runs Node.js, with
nothing to break or go out of date.

**Requirement: Node.js 22.5 or newer.** `node:sqlite` is a fairly new
built-in and isn't available on older Node versions. Check your version
with `node --version`. If you're stuck on an older Node (e.g. 18 or 20)
somewhere, see "Using an older Node version" at the bottom.

## Running it on your own computer

```bash
cd ssmv-app
node server/server.js
```

Then open **http://localhost:3000** in your browser. That's it — no build
step, no install step.

To use a different port: `PORT=8080 node server/server.js`.

To change the member passcode from the default `SSMV2026`:
`SSMV_PASSCODE=YourNewCode node server/server.js`.

Your data lives in `data/ssmv.db`. Back it up by copying that one file.
Deleting it just makes the app reseed itself with the starter
events/albums the next time it starts.

## Hosting it so others can reach it over the internet

Running it on your own laptop only lets people on the same WiFi reach it.
To make it reachable from anywhere, you need to run it somewhere that
stays on and has a public address. A few realistic options, roughly
cheapest/simplest to most robust:

### Option 1 — Keep a computer at the mandir always on + a tunnel (free)
If there's a spare computer or a Raspberry Pi that can stay powered on:
1. Run `node server/server.js` on it (ideally with something like `pm2`
   or a system service so it restarts itself if it crashes or the machine
   reboots).
2. Use a free tunnel service such as **Cloudflare Tunnel** or **Tailscale
   Funnel** to give it a public URL, without needing to touch your
   router's settings. Both have straightforward setup guides on their own
   sites.
- Upside: free, data stays entirely on your own hardware.
- Downside: only as reliable as your internet connection and that machine
  staying on.

### Option 2 — A small cloud server / VPS (most robust, ~$4–6/month)
Providers like **DigitalOcean**, **Hetzner**, or **Linode** rent a small
always-on Linux server. Roughly:
1. Create the smallest server they offer (Ubuntu is fine).
2. Install Node.js 22+ on it.
3. Copy this project onto it (`scp`, `git clone`, whatever's easiest).
4. Run it with `pm2 start server/server.js --name ssmv` (pm2 keeps it
   running and restarts it automatically) or as a `systemd` service.
5. Point your domain at the server's IP, or just use the IP address
   directly.
- Upside: full control, real persistent storage, predictable low cost.
- Downside: a bit more setup, and it's a small recurring cost.

### Option 3 — A hobby PaaS host (Render, Railway, etc.)
These let you deploy straight from a GitHub repo without managing a
server yourself.
1. Push this project to a GitHub repository.
2. Create a new Web Service on the platform, pointed at that repo.
3. Set the start command to `npm start`.
4. **Explicitly select Node.js 22** in the platform's settings (the
   `engines` field in `package.json` hints at this, but some platforms
   still need it picked manually).
5. **Important:** on most free tiers, the filesystem is wiped every time
   the service restarts or redeploys — which on a free plan can happen
   often (e.g. Render's free tier spins services down when idle). That
   means `data/ssmv.db` would get reset and you'd lose events/photos. To
   avoid that, attach a **persistent disk/volume** to the service (a paid
   add-on on Render, included on some Railway plans) and mount it at the
   `data/` folder. Without that, treat the free tier as fine for a demo,
   but not for real data you care about keeping.

### A note on photos
Photos are stored as compressed images directly inside the database
(nothing sits in separate files), so backing up `data/ssmv.db` backs up
every photo too — no separate media storage or upload service needed.

## Using an older Node version
If you're stuck hosting somewhere that only offers Node 18 or 20, swap
`node:sqlite` for the popular `better-sqlite3` npm package instead — the
rest of `db.js` would barely change, since the query style is nearly
identical. That does mean an actual `npm install better-sqlite3` step,
which needs a working internet connection and build tools on whatever
machine runs it.
