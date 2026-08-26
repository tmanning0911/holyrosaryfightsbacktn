/**
 * Cron every 15 minutes: pull Change.org so the next visitor gets a warm feed.
 * Invokes the same scrape path used by /api/petition-count.
 */
const { getFeed, json } = require("../lib/changeorg");

exports.handler = async function () {
  try {
    const data = await getFeed({ force: true });
    let milestone = { triggered: false };
    try {
      const { maybeNotifyPressReleaseMilestone } = require("../lib/press-release-milestone");
      milestone = await maybeNotifyPressReleaseMilestone(data);
    } catch (err) {
      milestone = { triggered: false, error: String(err && err.message ? err.message : err) };
    }
    return json(
      200,
      {
        ok: true,
        scheduled: true,
        total: data.total,
        displayed: data.displayed,
        signers: Array.isArray(data.signers) ? data.signers.length : 0,
        fetchedAt: data.fetchedAt,
        blobSaved: Boolean(data.blobSaved),
        cacheLayer: data.cacheLayer,
        pressReleaseMilestone: milestone,
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
