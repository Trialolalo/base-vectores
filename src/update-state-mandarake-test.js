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
    this.ids = []
    this.metadatas = []
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

    this.driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    this.products =  (await this.chromadbCollection.get()).metadatas.map(product => product)
  }

  async updateProducts() {
    for (const product of this.products){
      try {
        await this.driver.get(`https://order.mandarake.co.jp/order/detailPage/item?itemCode=127395772300`);
  
        await this.driver.sleep(3000); 
        const currentUrl = await this.driver.getCurrentUrl();
        const pageError = await this.driver.findElements(By.css('.error-page')); 

        if (currentUrl === 'https://order.mandarake.co.jp/order/') {
          console.log(`Producto redirigido a la página principal, no existe: ${product.url}`);
          await this.deleteProducts(product);  
          continue; 
        } 
        else if (currentUrl === 'https://www.mandarake.co.jp/ariaru/') {
          console.log(`Producto redirigido a la página principal de Ariaru, no existe: ${product.url}`);
          await this.deleteProducts(product);  
          continue; 
        }

      }catch (error) {
        console.log(error)
      }

      const layoutElement = await this.driver.findElements(By.id('__layout'));

      if (layoutElement.length > 0) {
        await this.updateProductsAriaru(product)
      }else{
        await this.updateProductsMandarake(product)
      }
    }

    if(this.ids.length > 0){
      await this.chromadbCollection.update({
        ids: this.ids,
        metadatas: this.metadatas
      })
    }
  }

  async updateProductsAriaru(product) {
    let availability;

    try {
      await this.driver.wait(until.elementLocated(By.css('.item__details .item__soldout')), 4000);
      availability = "sold out";
    } catch (error) {
      availability = "available";
    }

    if(availability !== product.availability){
      this.ids.push(product.id)
      this.metadatas.push({availability})
    }
  }

  async updateProductsMandarake(product) {
    let availability;

    try {
      await this.driver.wait(until.elementLocated(By.css('.detail_panel .soldout')), 4000);
      availability = "sold out";
    } catch (error) {
      availability = "available";
    }

    if(availability !== product.availability){
      this.ids.push(product.id)
      this.metadatas.push({availability})
    }
  }

  async deleteProducts(product) {

    await this.chromadbCollection.delete({
      ids: [product.id]  
    });

    const imagePath = `./../storage/scrapping/mandarake/images/${product.id}`;
    if (fs.existsSync(imagePath)) {
      fs.rmSync(imagePath, { recursive: true, force: true });
      console.log(`Imágenes del producto ${product.id} eliminadas correctamente`);
    } else {
      console.log(`No se encontraron imágenes para el producto ${product.id}`);
    }

    console.log(`Producto ${product.id} eliminado de la base de datos`);
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
