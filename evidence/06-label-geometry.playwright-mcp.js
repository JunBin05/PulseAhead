// Playwright MCP snippet: ticket 06 review-gate check that scene labels (zone, area, exit, ALERT bubble) never overlap
// or leave the canvas, with alerts on zones 1-4, at six viewport sizes. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, at: new Date().toISOString(), cases: [] };
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const SIZES = [[375, 812], [768, 812], [1024, 900], [1100, 900], [1440, 900], [1920, 1080]];
  const CASES = [['fixture-queue-surge', 30], ['fixture-congestion-boundary', 60], ['fixture-diagnostics', 90], ['fixture-diagnostics-gap', 95], ['fixture-boarding', 120]];
  const measure = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('.zone-label, .area-label, .alert-bubble')];
    const r = els.map((e) => ({ t: e.textContent.trim().slice(0, 28), b: e.getBoundingClientRect() }));
    const c = document.querySelector('canvas').getBoundingClientRect();
    const overlaps = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i].b, b = r[j].b; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${r[i].t} | ${r[j].t}`); }
    const clipped = r.filter((x) => x.b.left < c.left - 0.5 || x.b.right > c.right + 0.5 || x.b.top < c.top - 0.5 || x.b.bottom > c.bottom + 0.5).map((x) => x.t);
    const zones = [1, 2, 3, 4].map((z) => document.querySelector(`[data-testid="zone-${z}-status"]`)?.textContent?.trim());
    return { canvas: [Math.round(c.width), Math.round(c.height)], items: r.length, areaLabels: els.filter((e) => e.classList.contains('area-label')).length, bubbles: [...document.querySelectorAll('.alert-bubble')].map((e) => e.textContent.trim()), zones, overlaps, clipped };
  });
  for (const [fixture, minute] of CASES) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?fixture=${fixture}`);
    await page.getByTestId('start').click(); await waitV(1);
    for (let k = 1; k <= minute / 5; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
    await page.waitForTimeout(300);
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(450);
      R.cases.push({ fixture, minute, viewport: `${w}x${h}`, ...(await measure()) });
    }
  }
  const bad = R.cases.filter((c) => c.overlaps.length || c.clipped.length);
  R.summary = { cases: R.cases.length, withOverlapOrClip: bad.length, bad: bad.map((c) => `${c.fixture} ${c.viewport}: overlaps ${JSON.stringify(c.overlaps)} clipped ${JSON.stringify(c.clipped)}`), bubblesSeen: [...new Set(R.cases.flatMap((c) => c.bubbles))] };
  R.cases = R.cases.map((c) => `${c.fixture}@${c.minute} ${c.viewport} canvas ${c.canvas.join('x')} areaLabels ${c.areaLabels} bubbles [${c.bubbles.join(',')}] zones [${c.zones.join(',')}]`);
  return R;
}
