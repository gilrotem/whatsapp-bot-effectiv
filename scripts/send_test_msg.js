const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERSION } = process.env;

// Get the target number from the command line arguments
const TO_NUMBER = process.argv[2]; 

async function sendTest() {
    if (!TO_NUMBER) {
        console.error('Error: No phone number provided.');
        console.error('Usage: node scripts/send_test_msg.js <PHONE_NUMBER>');
        console.error('Example: node scripts/send_test_msg.js 972501234567');
        return;
    }

    console.log(`Attempting to send Hello World template to: ${TO_NUMBER}`);
    console.log(`From Phone ID: ${PHONE_NUMBER_ID}`);

    try {
        const url = `https://graph.facebook.com/${VERSION || 'v18.0'}/${PHONE_NUMBER_ID}/messages`;
        
        // Using "hello_world" template because it works even if the 24h window is closed
        const data = {
            messaging_product: 'whatsapp',
            to: TO_NUMBER,
            type: 'template',
            template: {
                name: 'hello_world',
                language: { code: 'en_US' }
            }
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.post(url, data, config);
        console.log('--- SUCCESS ---');
        console.log('Message ID:', response.data.messages[0].id);
        console.log('Status: Message queued by Meta.');
        console.log('Check your WhatsApp now!');

    } catch (error) {
        console.error('--- FAILED ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

sendTest();