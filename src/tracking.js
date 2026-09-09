/**
 * Scheduler analytics / conversion tracking
 * ───────────────────────────────────────────────────────────────────
 * The scheduler is a single-page modal: the booking completes without
 * ever navigating to a "thank you" URL, so a Google Tag Manager
 * page-view trigger can never see it. This module solves that by
 * pushing named events into the host page's `dataLayer`, which GTM
 * picks up as Custom Event triggers.
 *
 * It also captures Google Ads click IDs (gclid / gbraid / wbraid) and
 * UTM parameters on landing, stores them for 90 days, and hands them
 * back so they can ride along with the booking into ServiceTitan —
 * which is what makes offline conversion import (booked job → actual
 * revenue back into Google Ads) possible later.
 *
 * Configure via window.LEXSchedulerConfig.tracking — see
 * docs/GOOGLE-ADS-GTM-TRACKING.md. Everything here is optional and
 * fails silently; tracking must never break a booking.
 * ───────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY   = 'lexSchedulerAttribution';
const FIRED_KEY     = 'lexSchedulerConversions';
const ATTR_TTL_MS   = 90 * 24 * 60 * 60 * 1000; // 90 days — Google Ads' max click lookback

const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid', 'gclsrc', 'msclkid', 'fbclid'];
const UTM_PARAMS      = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];

function cfg() {
  const base = (typeof window !== 'undefined' &&
    (window.LEXSchedulerConfig || window.LEXMembersSchedulerConfig)) || {};
  return base.tracking || {};
}

function isEnabled() {
  return cfg().enabled !== false; // opt-out, not opt-in
}

// ── Storage helpers (private browsing / blocked storage safe) ───────
function readStore(key, store) {
  try {
    const raw = (store || window.localStorage).getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeStore(key, value, store) {
  try {
    (store || window.localStorage).setItem(key, JSON.stringify(value));
  } catch (e) { /* storage unavailable — attribution just won't persist */ }
}

// ── Attribution capture ─────────────────────────────────────────────
/**
 * Read click IDs / UTMs off the current URL and remember them.
 * A visitor can land on an ad, browse, and book days later; the stored
 * copy is what survives that. A fresh click always overwrites the old
 * one (last non-direct click wins, same as Google Ads' own model).
 */
export function captureAttribution() {
  let fromUrl = {};
  try {
    const params = new URLSearchParams(window.location.search);
    [...CLICK_ID_PARAMS, ...UTM_PARAMS].forEach(p => {
      const v = params.get(p);
      if (v) fromUrl[p] = v;
    });
  } catch (e) { fromUrl = {}; }

  const stored = readStore(STORAGE_KEY);
  const fresh  = Object.keys(fromUrl).length > 0;

  if (fresh) {
    const record = {
      ...fromUrl,
      landing_page: safeHref(),
      referrer:     safeReferrer(),
      captured_at:  Date.now(),
    };
    writeStore(STORAGE_KEY, record);
    return record;
  }

  if (stored && stored.captured_at && Date.now() - stored.captured_at < ATTR_TTL_MS) {
    return stored;
  }
  // No ad click on record — still note where this session came from.
  return { landing_page: safeHref(), referrer: safeReferrer(), captured_at: Date.now() };
}

export function getAttribution() {
  const stored = readStore(STORAGE_KEY);
  if (stored && stored.captured_at && Date.now() - stored.captured_at < ATTR_TTL_MS) return stored;
  return { landing_page: safeHref(), referrer: safeReferrer() };
}

function safeHref()     { try { return window.location.href;     } catch (e) { return ''; } }
function safeReferrer() { try { return document.referrer || '';  } catch (e) { return ''; } }

/**
 * GA4's client/session IDs, lifted from the _ga cookies. Sending these
 * to the backend lets a booked job be stitched back to its GA4 session
 * via the Measurement Protocol if that's ever wired up.
 */
function gaIds() {
  const out = {};
  try {
    const ga = document.cookie.match(/_ga=GA\d\.\d\.(\d+\.\d+)/);
    if (ga) out.ga_client_id = ga[1];
    const measurementId = cfg().measurementId; // e.g. 'G-ABC123'
    if (measurementId) {
      const suffix = measurementId.replace(/^G-/, '');
      const sess = document.cookie.match(new RegExp('_ga_' + suffix + '=GS\\d\\.\\d\\.(\\d+)'));
      if (sess) out.ga_session_id = sess[1];
    }
  } catch (e) { /* no cookie access */ }
  return out;
}

/** Flat attribution payload for the booking API / ServiceTitan. */
export function attributionPayload() {
  const a = getAttribution();
  const out = {};
  [...CLICK_ID_PARAMS, ...UTM_PARAMS].forEach(k => { if (a[k]) out[k] = a[k]; });
  if (a.landing_page) out.landing_page = a.landing_page;
  if (a.referrer)     out.referrer     = a.referrer;
  return { ...out, ...gaIds() };
}

// ── dataLayer push ──────────────────────────────────────────────────
function dataLayer() {
  const name = cfg().dataLayerName || 'dataLayer';
  window[name] = window[name] || [];
  return window[name];
}

/**
 * Push a scheduler event for GTM. Every event carries the same
 * scheduler_* context so a single set of GTM variables covers them all.
 */
export function pushEvent(event, params = {}) {
  if (!isEnabled()) return;
  try {
    const t = cfg();
    const payload = {
      event,
      scheduler_brand:    t.brand || inferBrand(),
      scheduler_version:  '1.0',
      ...attributionPayload(),
      ...params,
    };
    dataLayer().push(payload);
    if (t.debug) console.log('[Scheduler tracking]', event, payload);
  } catch (e) { /* never let tracking break the widget */ }
}

/** Best-effort brand guess from the configured booking endpoint. */
function inferBrand() {
  try {
    const ep = (window.LEXSchedulerConfig?.apiEndpoint ||
                window.LEXMembersSchedulerConfig?.apiEndpoint || '');
    const m = ep.match(/\/api\/(\w+)-booking/);
    return m ? m[1] : 'lex';
  } catch (e) { return 'lex'; }
}

// ── Conversion ──────────────────────────────────────────────────────
/**
 * Fire the booking conversion exactly once per job.
 *
 * `jobId` doubles as the Google Ads transaction_id, so even if the page
 * is reloaded or the tag double-fires, Google dedupes it.
 */
export function trackConversion(details = {}) {
  if (!isEnabled()) return;
  const t = cfg();
  const id = details.job_id ? String(details.job_id) : null;

  if (id) {
    const fired = readStore(FIRED_KEY, safeSession()) || [];
    if (fired.includes(id)) return;
    writeStore(FIRED_KEY, [...fired, id].slice(-25), safeSession());
  }

  const value = details.value != null ? details.value
              : (t.conversionValue != null ? t.conversionValue : undefined);

  pushEvent('booking_confirmed', {
    ...details,
    transaction_id: id || undefined,
    value,
    currency: t.currency || 'USD',
    ...(t.enhancedConversions && details.user_data
      ? { enhanced_conversion_data: details.user_data }
      : {}),
    user_data: undefined, // keep raw PII out unless enhanced conversions are on
  });

  // Direct gtag fallback for sites running the Google tag without GTM.
  if (t.googleAds && t.googleAds.conversionId && t.googleAds.conversionLabel) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to: `${t.googleAds.conversionId}/${t.googleAds.conversionLabel}`,
          value,
          currency: t.currency || 'USD',
          transaction_id: id || undefined,
        });
      }
    } catch (e) { /* gtag not present */ }
  }
}

function safeSession() {
  try { return window.sessionStorage; } catch (e) { return window.localStorage; }
}
