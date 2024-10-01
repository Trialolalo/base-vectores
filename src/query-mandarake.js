const { ChromaClient } = require('chromadb')
const chromaClient = new ChromaClient()
const OpenAIService = require('../services/openai-service')

class MandarakeQuery {
  constructor() {
    this.prompt = "Quiero un Ultraman por menos de 7000 yenes, que esté disponible y en perfectas condiciones"
    this.OpenAIService = null;
  }

  async run(){
    this.OpenAIService = await new OpenAIService()
    const chromadbCollection = await chromaClient.getOrCreateCollection({ name: 'mandarake' })
    const object = await this.OpenAIService.extractKeywords(this.prompt)

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

    const prompt = `${this.prompt} ${JSON.stringify(elements)}`
    const answer = await this.OpenAIService.filterData(prompt)

    console.log(answer)
  }
}

(async () => {
  const query = new MandarakeQuery();
  await query.run();
})();