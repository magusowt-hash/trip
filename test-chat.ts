import { chromium } from 'playwright';

async function testChat() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. 访问登录页面...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForLoadState('networkidle');
  console.log('   页面标题:', await page.title());

  console.log('\n2. 检查登录表单...');
  const usernameInput = await page.$('input[type="text"], input[name="username"], input[id*="username"], input[placeholder*="用户名"]');
  const passwordInput = await page.$('input[type="password"], input[name="password"]');
  const loginBtn = await page.$('button[type="submit"], button:has-text("登录")');

  console.log('   用户名输入框:', usernameInput ? '✓' : '✗');
  console.log('   密码输入框:', passwordInput ? '✓' : '✗');
  console.log('   登录按钮:', loginBtn ? '✓' : '✗');

  console.log('\n3. 检查页面控制台错误...');
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('\n4. 检查网络请求...');
  const failedRequests: string[] = [];
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
  });

  await page.waitForTimeout(2000);

  console.log('\n=== 结果 ===');
  if (errors.length) {
    console.log('控制台错误:');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('控制台错误: 无');
  }

  if (failedRequests.length) {
    console.log('失败请求:');
    failedRequests.forEach(r => console.log('  -', r));
  } else {
    console.log('失败请求: 无');
  }

  await browser.close();
}

testChat().catch(console.error);