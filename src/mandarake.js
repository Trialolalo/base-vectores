const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');

  try {
    await page.goto('https://mandarake.co.jp');

    await page.waitForSelector('ul.select');
    await page.click('ul.select li:first-child a');

    await page.waitForSelector('.category ul li.toy div.child div.container div.list div.block:nth-of-type(1) ul li:nth-of-type(1) a', { visible: true });

    await page.evaluate(() => {
      document.querySelector('.category ul li.toy div.child div.container div.list div.block:nth-of-type(1) ul li:nth-of-type(1) a').click();
    });

    for(let i = 2; i <= 199; i++) {
      await page.goto(`https://order.mandarake.co.jp/order/listPage/list?page=${i}&categoryCode=200104&lang=en`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // await browser.close();
  }
})();