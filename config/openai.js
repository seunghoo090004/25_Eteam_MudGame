const OpenAI = require('openai');
require('dotenv').config();

const client = new OpenAI({
    apiKey: process.env.api_key
});

if (!process.env.api_key) {
    console.error('API key not found in environment variables');
    throw new Error('Missing OpenAI API Key');
}

console.log('OpenAI client initialized successfully');

module.exports = client;