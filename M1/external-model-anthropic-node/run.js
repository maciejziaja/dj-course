import Anthropic from '@anthropic-ai/sdk/index.js';
import { countTokens, getTokenizer } from '@anthropic-ai/tokenizer';
import chalk from 'chalk';

import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Please set the ANTHROPIC_API_KEY environment variable.');
} else {
  console.log(`env var \"ANTHROPIC_API_KEY\" is: ${ process.env.ANTHROPIC_API_KEY.slice(0,4) + '...' + process.env.ANTHROPIC_API_KEY.slice(-4) }`)
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const model = 'claude-3-5-haiku-latest';
// const model = 'claude-haiku-4-5';
// const model = 'claude-opus-4-1';
// const model = 'claude-sonnet-4-5';

const conversationHistory = [
  { role: 'user', content: 'Proszę, napisz mi świetny dowcip programistyczny z którego wszyscy się będą śmiali, nawet moja babcia.' },
  { role: 'assistant', content: "Dlaczego programista nie lubi chodzić do restauracji?\nBo zawsze sprawdza \"if\" (warunek) przed zamówieniem." },
  { role: 'user', content: "Ten żart był głupi i nudny. Poproszę o lepszy żart, który będzie faktycznie zabawny. Zwróć tylko treść żartu." }
];

const MAX_TOKENS = 128;
const response = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: conversationHistory,
    model,
});
const tokenizer = getTokenizer();

const inputTokens = conversationHistory.reduce((sum, msg) => sum + countTokens(msg.content), 0);
const outputTokens = countTokens(response.content[0].text);
console.log({ inputTokens, outputTokens, usage: response.usage })

// console.log(response.content[0].text);
conversationHistory.push({ role: 'assistant', content: response.content[0].text });

conversationHistory.forEach(msg => {
  console.log(chalk.yellow(`${msg.role}: `) + chalk.white(msg.content));
  console.log(chalk.cyan(`> tokenized: `) + chalk.blue(tokenizer.encode(msg.content.normalize('NFKC'), 'all')));
  console.log('');
});

tokenizer.free();
