// Lighthouse CI audits routes (including /parent) in a fresh browser profile with
// default app settings — parentalLock.enabled defaults to true (issue #127), which
// would otherwise make Lighthouse audit the lock challenge screen instead of the
// real page content on every gated route. Runs once per collected URL (per
// @lhci/cli's puppeteerScript contract) in the same browser/profile Lighthouse
// itself audits with, so localStorage set here persists into that audit --
// unlike sessionStorage, which wouldn't survive across Lighthouse's own
// separate audited page load.
module.exports = async (browser, context) => {
  const page = await browser.newPage()
  await page.goto(context.url)
  await page.evaluate(() => {
    localStorage.setItem('playground_settings', JSON.stringify({ parentalLock: { enabled: false, pin: '' } }))
  })
  await page.close()
}
