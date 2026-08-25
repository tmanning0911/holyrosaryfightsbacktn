/**
 * Cron every 15 minutes: pull Change.org so the next visitor gets a warm feed.
 * Invokes the same scrape path used by /api/petition-count.
 */
const { getFeed, json } = require("../lib/changeorg");

exports.handler = async function () {
  try {
    const data = await getFeed({ force: true });
    return json(
      200,
      {
        ok: true,
        scheduled: true,
        total: data.total,
        signers: Array.isArray(data.signers) ? data.signers.length : 0,
        fetchedAt: data.fetchedAt,
        blobSaved: Boolean(data.blobSaved),
        cacheLayer: data.cacheLayer,
      },
      { force: true }
    );
  } catch (err) {
    return json(
      500,
      {
        ok: false,
        scheduled: true,
        error: String(err && err.message ? err.message : err),
      },
      { force: true }
    );
  }
};
