import { test, expect } from '@playwright/test';

test('check messages page loads', async ({ page }) => {
  // Visit messages page
  await page.goto('http://121.5.24.138:3000/messages');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  
  // Take screenshot
  await page.screenshot({ path: '/root/trip/messages-test.png', fullPage: true });
  
  console.log('URL after load:', page.url());
  
  // Check what elements are on the page
  const bodyText = await page.locator('body').innerText();
  console.log('Body contains:', bodyText.substring(0, 200));
});