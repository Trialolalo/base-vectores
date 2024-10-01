const { ChromaClient } = require('chromadb')
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

class MandarakeScraper {
  constructor() {
    this.chromadbCollection = null;
    this.driver = null;
    this.galleryProducts = [];
    this.products = {}
  }

  async init() {
    const client = new ChromaClient()
    this.chromadbCollection = await client.getOrCreateCollection({ name: 'mandarake' })

    let options = new chrome.Options();
    options.setUserPreferences({
			profile:{
				default_content_settings:{
				images: 2
			},
			managed_default_content_settings:{
				images: 2
			}
		}})
    
    options.addArguments('start-maximized'); // Maximizando ventana

    // Inicializa el driver de Chrome
    this.driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    this.products =  (await this.chromadbCollection.get()).metadatas.map(product => product)
  }

  async updateProducts() {
    const ids = []
    const metadatas = []

    for (const product of this.products){
      await this.driver.get(`${product.url}`);
      let availability;
  
      try {
        await this.driver.wait(until.elementLocated(By.css('.detail_panel .soldout')), 4000);
        availability = "sold out";
      } catch (error) {
        availability = "available";
      }
  
      if(availability !== product.availability){
        console.log(product.url)
        ids.push(product.id)
        metadatas.push({availability})
      }
    }

    if(ids.length > 0){
      await this.chromadbCollection.update({
        ids,
        metadatas
      })
    }
  }

  async run() {
    try {
      await this.init();
      await this.driver.manage().deleteAllCookies();
      await this.driver.get('https://mandarake.co.jp');

      await this.driver.wait(until.elementLocated(By.css('ul.select')), 10000);
      let firstItem = await this.driver.findElement(By.css('ul.select li:first-child a'));
      await firstItem.click();

      await this.updateProducts();

    } catch (error) {
      console.error('Error:', error);
    } finally {
      if (this.driver) {
        await this.driver.quit();  // Cerrar el navegador al final
      }
    }
  }
}

// Ejecutar la clase inmediatamente
(async () => {
  const scraper = new MandarakeScraper();
  await scraper.run();
})();
