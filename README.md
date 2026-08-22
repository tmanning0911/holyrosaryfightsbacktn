# Holy Rosary Fights Back — Tennessee

Live: **https://holyrosaryfightsbacktn.com**

Independent site for families and alumni. Not the parish office.

## Domain DNS (do this at whoever sold you the domain)

Point the domain at GitHub Pages:

**A records** (apex `holyrosaryfightsbacktn.com`):

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

**CNAME** for `www`: `tmanning0911.github.io`

Then in GitHub: repo Settings → Pages → Custom domain `holyrosaryfightsbacktn.com` → check Enforce HTTPS once it turns green.

## Petition names on every phone

Paste `petition-backend/Code.gs` into a Google Sheet Apps Script, deploy as a web app, put the URL in `app.js` as `PETITION_ENDPOINT`.
