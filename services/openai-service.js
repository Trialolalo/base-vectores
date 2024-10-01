require('dotenv').config();
const OpenAI = require('openai')
const { zodResponseFormat } = require('openai/helpers/zod')
const { z } = require('zod')

module.exports = class OpenAIService {
  constructor () {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }

  filterData = async (prompt, data) => {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: `Ante la pregunta del usuario, proporciona una respuesta humana que contenga los elementos que más se acerquen a la búsqueda del usuario y contengan la url de cada elemento. Si no encuentras nada responde "No he encontrado nada"`
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}`
              }
            ]
          }
        ],
        temperature: 1,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        response_format: {
          type: 'text'
        }
      })

      return response.choices[0].message.content
    } catch (error) {
      console.log(error)
    }
  }

  extractKeywords = async (prompt) => {
    try {
      const Keywords = z.object({
        keywords: z.array(z.string())
      })

      const response = await this.openai.beta.chat.completions.parse({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: `Extrae las palabras clave que resuma el texto aportado por el usuario. Elige únicamente aquellas sean relevantes para describir el texto de manera única e identificable.`
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}`
              }
            ]
          }
        ],
        temperature: 1,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        response_format: zodResponseFormat(Keywords, 'keywords')
      })

      const keywords= response.choices[0].message.parsed
      return keywords
    } catch (error) {
      console.log(error)
    }
  }
}
