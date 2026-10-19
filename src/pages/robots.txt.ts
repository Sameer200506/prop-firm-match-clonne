import type { APIRoute } from 'astro';

/**
 * Dynamic robots.txt — keeps the sitemap URL in sync with the configured
 * `site` (and whatever filename @astrojs/sitemap emits) at build time.
 */
export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemapURL.href}`,
    '', // trailing newline
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
