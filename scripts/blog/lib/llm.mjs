// Plain-text generation for the blog pipeline.
//
// This used to pick the first provider with a key and stop there, so one bad
// day at one provider meant no post. It now delegates to the harness router
// (scripts/harness/router.mjs): the article is a "heavy" job, routed across
// every free provider that is configured, with a per-day budget ledger.
//
// With no provider at all the caller still gets a clear error — a blog post
// is creative output, so unlike the digest there is no rule-based fallback.

import { PROVIDERS, plan, run } from '../../harness/router.mjs';

/**
 * Generate one plain-text article. Returns { text, provider, model }.
 * Throws when no provider is configured or every candidate fails.
 */
export async function generateArticleText(prompt, env = process.env) {
  const { text, provider, model } = await run({
    tier: 'heavy',
    task: 'blog-article',
    system: prompt.system,
    user: prompt.user,
    minChars: 1,
    env,
  });
  return { text, provider, model };
}

/** First provider the heavy tier would try, or null — kept for callers that only want to know "is anything configured?". */
export function detectProvider(env = process.env) {
  return plan({ tier: 'heavy', env }).attempts[0]?.provider || null;
}

export { PROVIDERS };
