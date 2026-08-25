/**
 * Change.org petition feed — pulled on the server, held ~15 minutes
 * via Netlify durable CDN cache (+ optional Blobs when credentials exist).
 */
const PETITION_URL =
  "https://www.change.org/p/reinstate-darren-mullis-as-principal-at-holy-rosary-catholic-school";
const SLUG = "reinstate-darren-mullis-as-principal-at-holy-rosary-catholic-school";
const BLOB_KEY = "snapshot";
const STORE_NAME = "changeorg-feed";
const TTL_MS = 15 * 60 * 1000;
const TTL_SEC = 15 * 60;

let memoryCache = null;

async function fetchFromChangeOrg() {
  const res = await fetch(PETITION_URL, {
    headers: {
      "User-Agent": "HolyRosaryFightsBack/1.0 (+https://holyrosaryfightsbacktn.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    const err = new Error("change_org_http");
    err.status = res.status;
    throw err;
  }
  const html = await res.text();
  const full = html.match(
    /"signatureCount"\s*:\s*\{\s*"displayed"\s*:\s*(\d+)\s*,\s*"total"\s*:\s*(\d+)\s*,\s*"goal"\s*:\s*(\d+)/
  );
  const state = html.match(
    /"signatureState"\s*:\s*\{\s*"signatureCount"\s*:\s*\{\s*"total"\s*:\s*(\d+)\s*,\s*"displayed"\s*:\s*(\d+)/
  );

  let displayed = null;
  let total = null;
  let goal = null;
  if (full) {
    displayed = Number(full[1]);
    total = Number(full[2]);
    goal = Number(full[3]);
  } else if (state) {
    total = Number(state[1]);
    displayed = Number(state[2]);
  }

  const signers = extractSigners(html);

  if ((total == null || Number.isNaN(total)) && !signers.length) {
    throw new Error("parse_failed");
  }
  if (total == null || Number.isNaN(total)) {
    total = signers.length;
    displayed = signers.length;
  }

  const dailyMatch = html.match(/"dailySignatureCount"\s*:\s*(\d+)/);
  const weeklyMatch = html.match(/"weeklySignatureCount"\s*:\s*(\d+)/);
  const daily = dailyMatch ? Number(dailyMatch[1]) : null;
  const weekly = weeklyMatch ? Number(weeklyMatch[1]) : null;

  return {
    ok: true,
    total,
    displayed: displayed ?? total,
    goal: goal || null,
    daily,
    weekly,
    signers,
    slug: SLUG,
    source: "change.org",
    petition: "https://c.org/2LMccZY9dk",
    fetchedAt: new Date().toISOString(),
    refreshMinutes: 15,
  };
}

function extractSigners(html) {
  const marker = '"recentPublicSignersConnectionV2"';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const brace = html.indexOf("{", start);
  if (brace === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = brace; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];
  try {
    const data = JSON.parse(html.slice(brace, end + 1));
    const edges = Array.isArray(data.edges) ? data.edges : [];
    return edges
      .map((edge) => {
        const user = edge && edge.user ? edge.user : {};
        const name = String(user.displayName || user.firstName || "").trim();
        if (!name) return null;
        return {
          name,
          at: edge.createdAt || null,
          relative: edge.createdAtRelativeLocalized || null,
          comment: (edge.comment && String(edge.comment).trim()) || null,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isFresh(payload, now = Date.now()) {
  if (!payload || !payload.fetchedAt) return false;
  const t = Date.parse(payload.fetchedAt);
  if (Number.isNaN(t)) return false;
  return now - t < TTL_MS;
}

function getBlobStore() {
  try {
    const { getStore } = require("@netlify/blobs");
    const siteID =
      process.env.SITE_ID ||
      process.env.BLOBS_SITE_ID ||
      "bbfc1fd9-c17a-4b7f-bdbe-813869b9be85";
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (token) {
      return getStore({ name: STORE_NAME, siteID, token });
    }
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
}

async function readBlob() {
  const s = getBlobStore();
  if (!s) return null;
  try {
    const data = await s.get(BLOB_KEY, { type: "json" });
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function writeBlob(payload) {
  const s = getBlobStore();
  if (!s) return false;
  try {
    await s.setJSON(BLOB_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer warm memory → Blobs → fresh Change.org pull.
 * CDN (Netlify-CDN-Cache-Control) keeps responses for 15 minutes site-wide.
 */
async function getFeed({ force = false } = {}) {
  if (!force && isFresh(memoryCache)) {
    return { ...memoryCache, cached: true, cacheLayer: "memory" };
  }

  if (!force) {
    const blob = await readBlob();
    if (isFresh(blob)) {
      memoryCache = blob;
      return { ...blob, cached: true, cacheLayer: "blob" };
    }
  }

  try {
    const fresh = await fetchFromChangeOrg();
    memoryCache = fresh;
    const saved = await writeBlob(fresh);
    return { ...fresh, cached: false, cacheLayer: "live", blobSaved: saved };
  } catch (err) {
    const blob = await readBlob();
    const fallback = isFresh(memoryCache) ? memoryCache : blob;
    if (fallback && fallback.ok) {
      return {
        ...fallback,
        cached: true,
        stale: true,
        cacheLayer: "stale",
        refreshError: String(err && err.message ? err.message : err),
      };
    }
    throw err;
  }
}

function json(statusCode, body, { force = false } = {}) {
  const cdn = force
    ? "public, max-age=0, must-revalidate"
    : `public, s-maxage=${TTL_SEC}, durable, stale-while-revalidate=300`;
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": cdn,
      "Cache-Tag": "petition-feed",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

module.exports = {
  TTL_MS,
  TTL_SEC,
  fetchFromChangeOrg,
  getFeed,
  json,
};
