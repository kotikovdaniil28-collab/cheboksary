import 'dotenv/config';
import OpenAI from 'openai';
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';

if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is missing in .env');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing in .env');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const BOT_NAME = 'Джон Вик';
const CHANNEL_HISTORY_LIMIT = 12;
const channelHistory = new Map();

function remember(channelId, role, name, text) {
  const history = channelHistory.get(channelId) || [];
  history.push({ role, name, text: text.slice(0, 1200) });
  while (history.length > CHANNEL_HISTORY_LIMIT) history.shift();
  channelHistory.set(channelId, history);
}

function shouldAnswer(message) {
  const text = message.content.toLowerCase().trim();
  const mentioned = message.mentions.has(client.user);
  const directName =
    text.startsWith('джон') ||
    text.startsWith('john') ||
    text.startsWith('вик') ||
    text.startsWith('!john') ||
    text.startsWith('!джон');

  return mentioned || directName || text === '!help' || text === '!ping';
}

function cleanPrompt(message) {
  return message.content
    .replaceAll(`<@${client.user.id}>`, '')
    .replaceAll(`<@!${client.user.id}>`, '')
    .replace(/^!?(джон|john|вик)[:,\s-]*/i, '')
    .trim();
}

async function askAI(message, userText) {
  const history = channelHistory.get(message.channelId) || [];

  const context = history
    .map((item) => `${item.name}: ${item.text}`)
    .join('\n');

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content:
          `Ты Discord-бот по имени ${BOT_NAME}. ` +
          'Общайся на русском, дружелюбно и полезно. ' +
          'Стиль: спокойный, уверенный, немного лаконичный, как профессионал. ' +
          'Не угрожай людям, не поощряй насилие, не раскрывай секретные ключи. ' +
          'Если вопрос технический, отвечай пошагово.',
      },
      {
        role: 'user',
        content:
          `Контекст последних сообщений в канале:\n${context || 'Пока нет контекста.'}\n\n` +
          `Сообщение пользователя ${message.author.username}: ${userText}`,
      },
    ],
  });

  return response.output_text || 'Я здесь, но сейчас не смог сформулировать ответ.';
}

async function replyInChunks(message, text) {
  const chunks = text.match(/[\s\S]{1,1900}/g) || [''];
  for (const chunk of chunks) {
    await message.reply(chunk);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`${BOT_NAME} вошёл в Discord как ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    remember(message.channelId, 'user', message.author.username, message.content);

    if (!shouldAnswer(message)) return;

    if (message.content.trim() === '!ping') {
      await message.reply('Понг. Джон Вик на связи.');
      return;
    }

    if (message.content.trim() === '!help') {
      await message.reply(
        'Напиши `Джон, вопрос` или упомяни меня через @. Например: `Джон, придумай идею для ивента на сервере`.'
      );
      return;
    }

    const userText = cleanPrompt(message) || 'Поздоровайся и скажи, чем можешь помочь.';
    await message.channel.sendTyping();

    const answer = await askAI(message, userText);
    remember(message.channelId, 'assistant', BOT_NAME, answer);
    await replyInChunks(message, answer);
  } catch (error) {
    console.error(error);
    await message.reply('У меня произошла ошибка. Проверь токены, права бота и логи в терминале.');
  }
});

client.login(DISCORD_TOKEN);
