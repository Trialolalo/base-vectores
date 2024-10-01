const { ChromaClient } = require('chromadb')
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const https = require('https')
const fs = require('fs');

class MandarakeScraper {
  constructor() {
    this.driver = null;
    this.galleryProducts = [];
    this.products = {}
  }

  async init() {
    const client = new ChromaClient()
    this.chromadbCollection = await client.getOrCreateCollection({ name: 'mandarake' })

    let options = new chrome.Options();
    options.addArguments('start-maximized'); // Maximizando ventana

    // Inicializa el driver de Chrome
    this.driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    this.storedProducts =  (await this.chromadbCollection.get()).ids.map(product => product)
  }

  async scrapeListPage(pageNumber) {
    await this.driver.get(`https://order.mandarake.co.jp/order/listPage/list?page=${pageNumber}&categoryCode=200104&lang=en`);

    let productElements = await this.driver.findElements(By.css('.thum a'));

    for (let productElement of productElements) {
      let url = await productElement.getAttribute('href');
      let title = (await productElement.findElement(By.xpath('./ancestor::div[@class="block"]//div[@class="title"]/p/a')).getText());
      let shop = (await productElement.findElement(By.xpath('./ancestor::div[@class="block"]//p[@class="shop"]')).getText()).split(' ')[0];
      let yenPrice = (await productElement.findElement(By.xpath('./ancestor::div[@class="block"]//div[@class="price"]/p')).getText()).split(' ')[0];
      let availability;

      try {
        await productElement.findElement(By.xpath('./ancestor::div[@class="block"]//div[@class="soldout"]'));
        availability = "sold out";
      } catch (error) {
        availability = "available";
      }

      const product = {
        title,
        url,
        shop,
        yenPrice,
        availability
      };

      this.galleryProducts.push(product);
    }
  }

  async scrapeProductDetails(product) {
    await this.driver.get(`${product.url}`);

    const urlParams = new URLSearchParams(new URL(product.url).search);
    const id = urlParams.get('itemCode');

    if(this.storedProducts.includes(id)){
      return;
    }

    if(!this.products[id]){

      product.condition = await this.driver.findElement(By.css('.condition td')).getText();
      product.size = await this.driver.findElement(By.css('.size td')).getText();

      if(!product.keywords){
        const keywordsElements = await this.driver.findElements(By.css('.category_path td p a'));
        product.keywords = await Promise.all(keywordsElements.map(async (keywordsElement) => {
          return await keywordsElement.getText();
        }));

        const excludedKeywords = ["Toys", "By Title", "By Genre", "By Work"];

        product.keywords = product.keywords.filter(keyword => !excludedKeywords.includes(keyword));
      }

      this.products[id] = {
        ...product
      }

      let images = await this.driver.findElements(By.css('#elevate_zoom_gallery img'))

      images = await Promise.all(images.map(async (element) => {
        return await element.getAttribute('src')
      }))
    
      for (const imageUrl of images) {
        try {
          const buffer = await new Promise((resolve, reject) => {
            https.get(imageUrl, (res) => {
              const chunks = []
  
              res.on('data', (chunk) => {
                chunks.push(chunk)
              })
  
              res.on('end', () => {
                resolve(Buffer.concat(chunks))
              })
  
              res.on('error', (err) => {
                reject(err)
              })
            })
          })
  
          if (!fs.existsSync(`./../storage/scrapping/mandarake/images/${id}`)) {
            fs.mkdirSync(`./../storage/scrapping/mandarake/images/${id}`, { recursive: true })
          }
  
          if (!fs.existsSync(`./../storage/scrapping/mandarake/images/${id}/${imageUrl.split('/').pop()}`)) {
            fs.writeFile(`./../storage/scrapping/mandarake/images/${id}/${imageUrl.split('/').pop()}`, buffer, () => {})
          }
        } catch (err) {
          console.log(err)
        }
      }

      try {
        // Esperar el elemento relacionado
        await this.driver.wait(until.elementLocated(By.css('.other_itemlist .block')), 3000);

        // Obtener todos los productos relacionados
        const relatedProducts = await this.driver.findElements(By.css('.other_itemlist .block'));

        // Iterar sobre los productos relacionados
        for (const relatedProduct of relatedProducts) {
          const shop = await relatedProduct.findElement(By.css('.shop p')).getText();
          const yenPrice = (await relatedProduct.findElement(By.css('.price p')).getText()).split(' ')[0];

          let availability;
          let url;

          // Verificar si el producto está agotado
          const soldOutElements = await relatedProduct.findElements(By.css('.soldout'));
          if (soldOutElements.length > 0) {
            // Si existe la clase soldout, obtener el enlace
            url = await soldOutElements[0].findElement(By.css('a')).getAttribute('href');
            availability = "sold out";
          } else {
            // Si no está agotado, obtener el enlace de agregar al carrito
            url = await relatedProduct.findElement(By.css('.addcart a')).getAttribute('href');
            availability = "available";
          }

          const newProduct = {
            ...product,
            url,
            shop,
            yenPrice,
            availability
          };

          await this.scrapeProductDetails(newProduct);
        }
        
      } catch (error) {

      }
    }
  }

  async run() {
    try {
      await this.init();
      await this.driver.manage().deleteAllCookies();

      // Ir a la página principal
      await this.driver.get('https://mandarake.co.jp');

      // Seleccionar el primer item
      await this.driver.wait(until.elementLocated(By.css('ul.select')), 10000);
      let firstItem = await this.driver.findElement(By.css('ul.select li:first-child a'));
      await firstItem.click();

      // Seleccionar la categoría
      let category = await this.driver.findElement(By.css('.toy a'));
      await category.click();

      // Recorrer páginas de productos
      for (let i = 3; i <= 3; i++) {
        await this.scrapeListPage(i);
      }

      // Obtener detalles de cada producto
      for (const product of this.galleryProducts) {
        await this.scrapeProductDetails(product);
      }

      fs.writeFile('./../storage/scrapping/mandarake/json/mandarake.json', JSON.stringify(this.products, null, 2), (err) => {
        if (err) {
          console.error('Error al guardar los detalles en el archivo JSON:', err)
        } else {
          console.log('Detalles guardados en mandarake.json')
        }
      })

      const ids = []
      const metadatas = []
      const documents = []

      if(this.products.length > 0){
        Object.entries(this.products).forEach(([key, value]) =>{
          ids.push(key)
          documents.push(value.keywords.join(' '))
          
          delete value.keywords
          value.id = key
          metadatas.push(value)
        })
  
        await this.chromadbCollection.add({
          ids,
          metadatas,
          documents
        })
      }
      
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
