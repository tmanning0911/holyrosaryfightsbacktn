/**
 * Netlify automatic form hook — runs on every form submission.
 * Backup path when the browser welcome call fails (Safari quirks, etc.).
 */
const { handler: welcomeHandler } = require("./welcome-send");

exports.handler = async function (event, context) {
  // Normalize to the same shape welcome-send expects
  let body = event.body;
  try {
    const parsed = JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body || "{}");
    const submission = parsed.payload || parsed;
    body = JSON.stringify(submission);
  } catch (_) {}

  return welcomeHandler(
    {
      ...event,
      httpMethod: "POST",
      headers: {
        ...(event.headers || {}),
        "content-type": "application/json",
      },
      body,
      isBase64Encoded: false,
    },
    context
  );
};
