# Holy Rosary Fights Back — Tennessee

Live: **https://holyrosaryfightsbacktn.com**

Independent site for families and alumni. Not the parish office.

## Hosting

Live on Netlify (DNS + site). Domain was registered through Netlify.

- Production: https://holyrosaryfightsbacktn.com
- Netlify subdomain: https://holyrosaryfightsbacktn.netlify.app
- Dashboard: https://app.netlify.com/projects/holyrosaryfightsbacktn

Redeploy from this folder:

```bash
npx netlify-cli@17 deploy --prod --dir . --site bbfc1fd9-c17a-4b7f-bdbe-813869b9be85
```

## Petition names on every phone

Paste `petition-backend/Code.gs` into a Google Sheet Apps Script, deploy as a web app, put the URL in `app.js` as `PETITION_ENDPOINT`.
