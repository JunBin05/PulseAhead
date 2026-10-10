// Playwright MCP snippet: ticket 07 camera easing probe (samples data-camera-zoom every 30 ms after clicking an alert zone).
// Run with browser_run_code_unsafe; expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-staffing');
  await page.getByTestId('start').click(); await waitV(1);
  for (let k = 1; k <= 6; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
  const run = async (label) => {
    const samples = await page.evaluate(async () => {
      const out = [];
      const c = document.querySelector('.scene-canvas');
      document.querySelector('[data-testid=zone-1]').click();
      const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        out.push([Math.round(performance.now() - t0), Number(c.dataset.cameraZoom), c.dataset.camera]);
        await new Promise((r) => setTimeout(r, 30));
      }
      return out;
    });
    const zooms = samples.map((s) => s[1]);
    const mono = zooms.every((z, i) => i === 0 || z >= zooms[i - 1] - 1e-9);
    return { label, n: samples.length, first: samples[0], last: samples.at(-1), distinct: [...new Set(zooms)].length, intermediate: [...new Set(zooms)].filter((z) => z > 1 && z < 1.9).length, monotonic: mono, sample: samples.filter((_, i) => i % 3 === 0).map((s) => `${s[0]}ms:${s[1]}`) };
  };
  const a = await run('ease');
  await page.getByTestId('back-to-overview').click(); await page.waitForTimeout(900);
  await page.getByTestId('zone-1').click(); await page.waitForTimeout(100);
  return { a };
}
