const { ChromaClient } = require('chromadb')
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const https = require('https')
const fs = require('fs');
const mysql = require('mysql2/promise');
const OpenAIService = require('./services/openai-service');
const TelegramService = require('./services/telegram-service');

class MandarakeScraper {
  constructor() {
    this.chromadbCollection = null;
    this.driver = null;
    this.galleryProducts = [];
    this.products = {}
  }

  async initDB() {
    this.connection = await mysql.createConnection({
      host: 'localhost',   // Cambia esto según tu configuración
      user: 'root',        // Usuario de MySQL
      password: 'password', // Contraseña de MySQL
      database: 'mandarake'  // Nombre de la base de datos
    });
  }

  async logScriptExecution(scriptname, completed) {
    const datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const query = `
      INSERT INTO script_logs (scriptname, completed, datetime)
      VALUES (?, ?, ?)
    `;
    await this.connection.execute(query, [scriptname, completed, datetime]);
  }

  async init() {
    const client = new ChromaClient()
    this.chromadbCollection = await client.getOrCreateCollection({ name: 'mandarake' })

    let options = new chrome.Options();
    options.addArguments('start-maximized'); // Maximizando ventana

    // Inicializa el driver de Chrome
    this.driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  }

  async scrapeListPage(pageNumber) {
    await this.driver.get(`https://order.mandarake.co.jp/order/listPage/list?page=${pageNumber}&categoryCode=200104&lang=en`);

    let productElements = await this.driver.findElements(By.css('.block .new_arrival'));

    if(productElements.length > 0){
      for (let productElement of productElements) {
        let parentBlock = await productElement.findElement(By.xpath('./ancestor::div[@class="block"]'));
        let thumbLink = await parentBlock.findElement(By.css('.thum a'));
        let url = await thumbLink.getAttribute('href');

        const urlParams = new URLSearchParams(new URL(url).search);
        const id = urlParams.get('itemCode');

        const element = await this.chromadbCollection.get({
          ids: [id]
        });

        const r18markElements = await productElement.findElements(By.xpath('./ancestor::div[@class="thum"]//div[contains(@class, "r18mark")]'));
        
        // Si encuentra un elemento con la clase "r18mark", saltarlo
        if (r18markElements.length > 0) {
          console.log("Elemento saltado por ser contenido R18");
          continue; 
        }


        if(element.ids.length > 0){
          continue
        }

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
          id,
          title,
          url,
          shop,
          yenPrice,
          availability
        };

        this.galleryProducts.push(product);
      }

      return true
    }else{
      return false
    }
  }

  async scrapeProductDetails(product) {
    await this.driver.get(`${product.url}`);

    const layoutElement = await this.driver.findElements(By.id('__layout'));

    if (layoutElement.length > 0) {
      await this.scrapeAriaruProduct(product)
    }else{
      await this.scrapeMandarakeProduct(product)
    }
  }

  async scrapeAriaruProduct(product){
    const urlParams = new URLSearchParams(new URL(product.url).search);
    const id = urlParams.get('itemCode');

    if(!this.products[id]){
      product.condition = await this.driver.findElement(By.css('.item__property dd')).getText();
      product.size  = await this.driver.findElement(By.css('dl.item__property dd:nth-of-type(2)')).getText();

      const keywordsElements = await this.driver.findElements(By.css('div.item__feature ul li'));

      product.keywords = await Promise.all(keywordsElements.map(async (keywordsElement) => {
        return await keywordsElement.getText();
      }));

      this.products[id] = {
        ...product
      }

      let images = await this.driver.findElements(By.css('.item__thumbnail-images img'))

      images = await Promise.all(images.map(async (element) => {
        const image = (await element.getAttribute('src')).replace('s_','')
        return image
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
    }
  }

  async scrapeMandarakeProduct(product) {
    await this.driver.get(`${product.url}`);

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

    this.products[product.id] = {
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

        if (!fs.existsSync(`./../storage/scrapping/mandarake/images/${product.id}`)) {
          fs.mkdirSync(`./../storage/scrapping/mandarake/images/${product.id}`, { recursive: true })
        }

        if (!fs.existsSync(`./../storage/scrapping/mandarake/images/${product.id}/${imageUrl.split('/').pop()}`)) {
          fs.writeFile(`./../storage/scrapping/mandarake/images/${product.id}/${imageUrl.split('/').pop()}`, buffer, () => {})
        }
      } catch (err) {
        console.log(err)
      }
    }
  }

  splitIntoBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      batches.push(batch);
    }
    return batches;
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
      let menuButton = await this.driver.wait(until.elementLocated(By.css('.toy .parent')), 10000);
      await menuButton.click(); 


      let category = await this.driver.wait(until.elementLocated(By.xpath("//a[contains(text(), 'Sofubi')]")), 10000);
      await this.driver.wait(until.elementIsVisible(category), 10000); // Asegúrate de que el elemento es visible
      await category.click(); // Hacer clic en "Sofubi"

      // Recorrer páginas de productos
      for (let i = 1; i <= 199; i++) {
        const page = await this.scrapeListPage(i);

        if(!page){
          break
        }
      }

      // Obtener detalles de cada producto
      for (const product of this.galleryProducts) {
        await this.scrapeProductDetails(product);
      }

      const date = new Date()
      const formattedDate = date.toISOString().split('T')[0];

      fs.writeFile(`./../storage/scrapping/mandarake/json/mandarake-${formattedDate}.json`, JSON.stringify(this.products, null, 2), (err) => {
        if (err) {
          console.error('Error al guardar los detalles en el archivo JSON:', err)
        } else {
          console.log('Detalles guardados en mandarake.json')
        }
      })

      if(this.products.length > 0){
        const ids = []
        const metadatas = []
        const documents = []
        const batchSize = 100;

        Object.entries(this.products).forEach(([key, value]) =>{
          ids.push(key)
          documents.push(value.keywords.join(' '))
          
          delete value.keywords
          value.id = key
          metadatas.push(value)
        })

        const idBatches = splitIntoBatches(ids, batchSize);
        const metadataBatches = splitIntoBatches(metadatas, batchSize);
        const documentBatches = splitIntoBatches(documents, batchSize);

        for (let i = 0; i < idBatches.length; i++) {
          try {
            console.log(`Enviando lote ${i + 1} de ${idBatches.length}...`);
      
            await chromadbCollection.add({
              ids: idBatches[i],
              metadatas: metadataBatches[i],
              documents: documentBatches[i]
            });
      
            console.log(`Lote ${i + 1} enviado correctamente.`);
          } catch (err) {
            console.log(`Error al enviar el lote ${i + 1}:`, err);
          }
        }
      }

      const telegramService = new TelegramService();
      const message = 'Scrapping hecho con éxito'
      telegramService.sendMessage(process.env.CHAT_ID, message);

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
