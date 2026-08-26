# Resend — holyrosaryfightsbacktn.com

## Goal
Send the Call to mobilize welcome email from:

`Rams Fight Back <hello@holyrosaryfightsbacktn.com>`

Use the full campaign-style `welcome.html` (hero, Darren, petition count, Call them). Light/dark CSS included for mail clients that support it.

## Status checklist
1. [x] Domain added in [Resend Domains](https://resend.com/domains)
2. [x] DNS records added in Netlify (site DNS for `holyrosaryfightsbacktn.com`)
3. [x] Domain shows **Verified** in Resend
4. [x] `RESEND_API_KEY` set in Netlify env
5. [x] `RESEND_FROM=Rams Fight Back <hello@holyrosaryfightsbacktn.com>` set in Netlify env
6. [x] `RESEND_REPLY_TO=hello@holyrosaryfightsbacktn.com` set in Netlify env
7. [x] Welcome send wired on mobilize form (`POST /api/welcome-send`)
8. [x] Test send to taylormanning33@gmail.com

## How signup email works
1. Visitor submits **Join the call** (hero or footer).
2. Browser posts the Netlify Form (`mobilize` / `mobilize-footer`) so the contact is stored.
3. If email opt-in is on (hero checkbox, or footer by default), browser calls `POST /api/welcome-send` with `{ email, email_ok: true }`.
4. Netlify function loads `email-previews/welcome.html`, fills `[[PETITION_COUNT]]`, sends via Resend.

## Local preview
http://127.0.0.1:5173/email-previews/

Setup walkthrough:

http://127.0.0.1:5173/email-previews/resend-setup.html

## DNS note
Nameservers are Netlify/NS1 (`dns*.p09.nsone.net`). Required Resend records (verified):

- `TXT` `resend._domainkey` → DKIM `p=…`
- `MX` `rsend` → `feedback-smtp.us-east-1.amazonses.com` (priority 10)
- `TXT` `rsend` → `v=spf1 include:amazonses.com ~all`
- Optional `TXT` `_dmarc` → `v=DMARC1; p=none;`

## Receiving mail at hello@holyrosaryfightsbacktn.com

Press replies and other inbound mail to `hello@` are forwarded to your Gmail as a notification.

### One-time setup (Resend + Netlify DNS)

1. [Resend Domains](https://resend.com/domains) → `holyrosaryfightsbacktn.com` → **Receiving** → turn **on**.
2. Copy the **MX** record Resend shows (root domain `@`, not `rsend`). Add it in Netlify DNS with the exact priority Resend gives you.
3. Click **I've added the record** in Resend until receiving shows **Verified**.
4. Create the webhook (dashboard or script below):
   - **URL:** `https://holyrosaryfightsbacktn.com/api/resend-inbound`
   - **Event:** `email.received`
5. Netlify → **Environment variables** (production):
   - `RESEND_WEBHOOK_SECRET` = signing secret from webhook (`whsec_…`)
   - `INBOUND_FORWARD_TO` = `taylormanning33@gmail.com` (or your inbox)
6. **Deploy** the site so `/.netlify/functions/resend-inbound` is live.

### Webhook via script (optional)

```bash
node scripts/setup-resend-inbound-webhook.js
```

Paste the printed `RESEND_WEBHOOK_SECRET` into Netlify.

### Test

Send mail to `hello@holyrosaryfightsbacktn.com` from another address. You should get a Gmail with subject `[hello@] …` and **Reply** goes back to the original sender.

### How it works

1. MX delivers mail to Resend.
2. Resend POSTs `email.received` to `/api/resend-inbound`.
3. Function verifies Svix signature, fetches the message via Resend API, forwards to `INBOUND_FORWARD_TO`.

Dedup uses Netlify Blobs (`inbound-forwards`) so webhook retries do not double-forward.
