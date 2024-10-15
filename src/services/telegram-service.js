const TelegramBot = require('node-telegram-bot-api');

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: false }); // Cambia a false para evitar conflictos

    this.bot.onText(/\/saluda/, async (msg) => {
      const chatId = msg.chat.id; // Obtener el ID del chat
      await this.sendMessage(chatId, "¡Hola! ¿Cómo estás?"); // Responder al saludo
    });
  }

  // Método para enviar un mensaje
  async sendMessage(chatId, message) {
    try {
      await this.bot.sendMessage(chatId, message);
      console.log('Mensaje enviado:', message);
    } catch (error) {
      console.error('Error al enviar el mensaje:', error);
    }
  }
}

// Exportar el servicio para usarlo en otros módulos
module.exports = TelegramService;