/**
 * Public API: Change.org live feed (server-cached ~15 minutes via Netlify CDN).
 * GET /api/petition-count
 * GET /api/petition-count?refresh=1 — bypass CDN / force pull
 */
const { getFeed, json } = require("../lib/changeorg");

exports.handler = async function (event) {
  try {
    const force =
      event.queryStringParameters &&
      (event.queryStringParameters.refresh === "1" ||
        event.queryStringParameters.refresh === "true");
    const data = await getFeed({ force: Boolean(force) });
    return json(200, data, { force: Boolean(force) });
  } catch (err) {
    return json(
      502,
      {
        ok: false,
        error: "feed_unavailable",
        message: String(err && err.message ? err.message : err),
      },
      { force: true }
    );
  }
};
