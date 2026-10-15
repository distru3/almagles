import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('client index.html vs the production Content-Security-Policy', () => {
  // Production sends `script-src 'self'`, which blocks inline scripts without
  // any visible error in development. An inline theme script once silently
  // never ran on the live site because of this.
  it('has no inline <script> blocks', () => {
    const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs, 'every script must load from a file (src=…)').toMatch(/\bsrc=/);
      expect(body.trim(), 'scripts must not carry inline code').toBe('');
    }
  });

  it('does not use inline event handlers (onclick=… etc.)', () => {
    const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
