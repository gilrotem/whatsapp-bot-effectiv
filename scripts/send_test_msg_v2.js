const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERSION } = process.env;

const TO_NUMBER = process.argv[2]; 

async function sendTest() {
    if (!TO_NUMBER) {
        console.error('Error: No phone number provided.');
        process.exit(1);
    }

    console.log(`Sending TEXT message to: ${TO_NUMBER}`);

    try {
        const url = `https://graph.facebook.com/${VERSION || 'v18.0'}/${PHONE_NUMBER_ID}/messages`;
        
        const data = {
            messaging_product: 'whatsapp',
            to: TO_NUMBER,
            type: 'text',
            text: {
                body: "היי! זה הבוט שלך. החיבור הצליח! 🚀\n(נשלח מהשרת המקומי)"
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

    } catch (error) {
        console.error('--- FAILED ---');
        console.error(error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

sendTest();