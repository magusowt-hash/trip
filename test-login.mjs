import { chromium } from 'playwright';

const BROWSER_URL = 'http://127.0.0.1:3000';

async function testLogin() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors = [];
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });
  page.on('pageerror', err => errors.push(err.message));

  console.log('Navigating to login page...');
  await page.goto(`${BROWSER_URL}/login`, { waitUntil: 'networkidle' });
  
  // Fill login form - use label text to find inputs
  const inputs = page.locator('input[type="tel"], input[type="password"]');
  await inputs.nth(0).fill('13018888463');
  await inputs.nth(1).fill('12345678');
  await page.click('button[type="submit"]');
  
  // Wait for login to complete and WebSocket to attempt connection
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const wsLogs = logs.filter(l => l.includes('[WS]'));
    console.log(`Check ${i + 1}: ${wsLogs.slice(-1).join(' ')}`);
  }
  
  console.log('\n--- Console Logs ---');
  logs.forEach(l => console.log(l));
  
  // Wait for navigation or network to settle
  await page.waitForTimeout(3000);
  
  console.log('\n--- Console Errors ---');
  const wsErrors = errors.filter(e => e.includes('WebSocket') || e.includes('ws://') || e.includes('[WS]'));
  if (wsErrors.length > 0) {
    wsErrors.forEach(e => console.log(e));
  } else {
    console.log('No websocket errors found');
  }
  
  console.log('\n--- All Errors ---');
  if (errors.length > 0) {
    errors.forEach(e => console.log(e));
  } else {
    console.log('No errors found');
  }
  
  await browser.close();
}

testLogin().catch(console.error);