import { searchArticles } from './search.js';
import { publicArticles, comments } from './client.js';

// Optional, read-only search integration. Capture the same public state shown
// by the interface after each render; tools never receive private records.
let snapshot = { articles: [], comments: [] };
export function refreshPublicSnapshot() {
  snapshot = { articles: publicArticles(), comments: comments().filter(c => c.status === 'published') };
}
export function registerPublicSearch(doc = globalThis.document) {
  if (!doc?.modelContext?.registerTool) return false;
  const lifecycle = new AbortController();
  const tool = {
    name: 'search_narv_public_content',
    title: 'Search published NARV content',
    description: 'Search published articles and approved comments by keyword, optional dates and fuzzy matching. Does not change content or access private submissions.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', maxLength: 150 }, from: { type: 'string' }, to: { type: 'string' }, fuzzy: { type: 'boolean' } },
      required: ['query'], additionalProperties: false
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input) {
      if (!input || typeof input.query !== 'string' || input.query.length > 150) throw new Error('A query of at most 150 characters is required.');
      if (Object.keys(input).some(k => !['query', 'from', 'to', 'fuzzy'].includes(k))) throw new Error('Unknown search option.');
      if (input.fuzzy !== undefined && typeof input.fuzzy !== 'boolean') throw new Error('fuzzy must be boolean.');
      if (['from','to'].some(k => input[k] !== undefined && typeof input[k] !== 'string')) throw new Error('Dates must be strings.');
      return searchArticles(snapshot.articles, snapshot.comments, input).slice(0, 20).map(r => ({ id: r.article.id, title: r.article.title, excerpt: r.excerpt, source: r.source, path: '#/article/' + r.article.id + (r.commentId ? '?comment=' + r.commentId : '') }));
    }
  };
  try { Promise.resolve(doc.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => lifecycle.abort()); }
  catch { lifecycle.abort(); return false; }
  globalThis.addEventListener?.('pagehide', () => lifecycle.abort(), { once: true });
  return true;
}