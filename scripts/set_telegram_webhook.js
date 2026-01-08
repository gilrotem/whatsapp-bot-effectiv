const axios = require('axios');
require('dotenv').config({ path: '../.env' });

const TOKEN = process.env.TELEGRAM_TOKEN;
const TUNNEL_URL = 'https://e392364ac85209.lhr.life'; 
const WEBHOOK_URL = `${TUNNEL_URL}/telegram_webhook`;

async function setWebhook() {
    try {
        console.log(`Setting webhook to: ${WEBHOOK_URL}`);
        const url = `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`;
        const res = await axios.get(url);
        console.log('Result:', res.data);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

setWebhook();
