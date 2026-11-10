import { describe, expect, it } from 'vitest';
import { bentoLayout } from '../components/site/Home';

const projects = ['query', 'nexa', 'system', 'gryphon', 'checkout', 'password', 'flex', 'snap', 'incluvie'] as const;

describe('source bento layout with Motion proof removed', () => {
  for (const phone of [false, true]) for (const view of ['selected', 'all', 'work', 'personal'] as const) {
    it(`keeps every card within a non-overlapping ${phone ? 'mobile' : 'desktop'} grid in ${view}`, () => {
      for (const expanded of [null, ...projects]) {
        const layout = bentoLayout(phone, view, expanded);
        const columns = phone ? 2 : 6;
        expect(layout.items).toHaveLength(12);
        expect(layout.items.some((item) => String(item[0]) === 'motion')).toBe(false);
        for (const item of layout.items) {
          expect(item[1]).toBeGreaterThanOrEqual(0); expect(item[2]).toBeGreaterThanOrEqual(0);
          expect(item[1] + item[3]).toBeLessThanOrEqual(columns);
          expect(item[2] + item[4]).toBeLessThanOrEqual(layout.rows);
          for (const other of layout.items) {
            if (other === item) continue;
            const intersects = item[1] < other[1] + other[3] && item[1] + item[3] > other[1] && item[2] < other[2] + other[4] && item[2] + item[4] > other[2];
            expect(intersects, `${item[0]} overlaps ${other[0]} after expanding ${expanded}`).toBe(false);
          }
        }
      }
    });
  }
});
