// Small shared helpers. No external dependencies on purpose: the collector has
// to run on a bare GitHub Actions runner with nothing installed.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Progress goes to stderr so `--dry-run` can pipe clean JSON on stdout.
export function log(...args) {
  console.error(`[${new Date().toISOString()}]`, ...args);
}

export function warn(...args) {
  console.warn(`[${new Date().toISOString()}] WARN`, ...args);
}

/** Date string (YYYY-MM-DD) in a given IANA timezone. */
export function dateInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Human readable local time, e.g. "2026-09-02 09:00". */
export function timeInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace('T', ' ');
}

export function daysBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / DAY_MS;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() with a timeout and a couple of retries. Every network source in this
 * project is best effort: a single dead feed must never fail the whole run.
 */
export async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'user-agent': 'infocollect/1.0 (+https://github.com/gentaron/infocollect)',
          ...(options.headers || {}),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Strip HTML tags / entities and collapse whitespace. */
export function stripHtml(input = '') {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Normalise a URL for de-duplication (drop tracking params and trailing slash). */
export function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|ref|source|fbclid|gclid|mc_)/i.test(key)) parsed.searchParams.delete(key);
    }
    let out = parsed.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return String(url || '');
  }
}
