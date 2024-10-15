require('dotenv').config();
const https = require('https');
const { ChromaClient } = require('chromadb')
const chromaClient = new ChromaClient()
const OpenAIService = require('./services/openai-service')
const TelegramBot = require('node-telegram-bot-api')
const fs = require('fs/promises')
const fsClassic = require('fs');
const path = require('path')

class MandarakeQuery {
  constructor() {
    this.initializeOpenAIService();
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true }); 

    this.bot.onText(/\/busca/, async (msg) => {
      const chatId = msg.chat.id; 
      const message = msg.text.replace('/busca','')
      await this.search(message, chatId);
    });

    this.bot.on('message', async (msg) => {
      if (msg.photo) {
        const chatId = msg.chat.id
        await this.analyzeImage(msg, chatId)
      }
    })

    // this.bot.onText(/\/all/, async (msg) => {
    //   const chromadbCollection = await chromaClient.getOrCreateCollection({ name: 'mandarake' })
    //   const data = await chromadbCollection.get()
    //   console.log(data)
    // });
  }

  async initializeOpenAIService() {
    this.OpenAIService = await new OpenAIService();
  }

  async analyzeImage(message, chatId){
    const fileId = message.photo[message.photo.length - 1].file_id;
    try{
      const fileUrl = await this.bot.getFileLink(fileId)
      const base64 = await this.imageToBase64(fileUrl)
      const images = [base64]
      const prompt = "¿que personaje crees que es? dime un nombre aunque tengas dudas. Responde solo con el nombre"

      await this.sendMessage("Analizando imagen", chatId)
      const response = await this.OpenAIService.analyzeImages(images, prompt)


      await this.sendMessage("Estoy consultando la base de datos", chatId)
      const chromadbCollection = await chromaClient.getOrCreateCollection({ name: 'mandarake' })

      const result = await chromadbCollection.query({
        nResults: 3,
        queryTexts: [response.toLowerCase()]
      })

      const elements = result.documents[0].map((_, i) => {
        const element = {}
  
        Object.entries(result.metadatas[0][i]).forEach(([key, value]) => {
          element[key] = value
        })
  
        return element
      })

      const baseDirectory = path.join(__dirname, '../storage/scrapping/mandarake/images');

      await this.sendMessage("He encontrado los siguientes productos:", chatId)

      for(const element of elements){
        const folderPath = path.join(baseDirectory, element.id);
    
        try {
          await fs.access(folderPath, fs.constants.F_OK);
          
          const files = await fs.readdir(folderPath);
          const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/.test(file));
          const imagePaths = imageFiles.map(file => path.join(folderPath, file));

          await this.sendMessage(
              `Título: ${element.title}.
               Precio (yenes): ${element.yenPrice}
               Enlace: ${element.url}`
          , chatId)

          for(const imagePath of imagePaths){
            await this.bot.sendPhoto(chatId, fsClassic.createReadStream(imagePath))
          }
    
        } catch (err) {
          console.error(`Error leyendo la carpeta ${folderPath}:`, err);
        }
      }
       
    }catch(err){
      console.log(err)
    }
  }

  async search(message, chatId){
    const chromadbCollection = await chromaClient.getOrCreateCollection({ name: 'mandarake' })
    const object = await this.OpenAIService.extractKeywords(message)

    this.sendMessage("Estoy consultando la base de datos", chatId)

    const result = await chromadbCollection.query({
      nResults: 10,
      queryTexts: [object.keywords.join(' ')]
    })

    const elements = result.documents[0].map((_, i) => {
      const element = {}

      Object.entries(result.metadatas[0][i]).forEach(([key, value]) => {
        element[key] = value
      })

      return element
    })

    const finalPrompt = `${message} ${JSON.stringify(elements)}`
    this.sendMessage("Ahora estoy filtrando los datos", chatId)
    const answer = await this.OpenAIService.filterData(finalPrompt)
    this.sendMessage(answer, chatId)
  }

  async sendMessage(message, chatId) {
    try {
      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error al enviar el mensaje:', error);
    }
  }

  async imageToBase64(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = [];
  
        res.on('data', (chunk) => {
          data.push(chunk);
        });
  
        res.on('end', () => {
          const buffer = Buffer.concat(data);
          const base64Image = buffer.toString('base64');
          resolve(base64Image);
        });
      }).on('error', (err) => {
        reject(`Error al descargar la imagen: ${err.message}`);
      });
    });
  }
}

(async () => {
  new MandarakeQuery();
  setInterval(() => {}, 1000);
})();