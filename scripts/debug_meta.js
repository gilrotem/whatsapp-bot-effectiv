const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');

const token = process.env.WHATSAPP_TOKEN;
const wabaId = process.env.WABA_ID;

console.log('--- DIAGNOSTIC START ---');
console.log(`Testing with WABA ID: ${wabaId}`);
console.log(`Token present: ${!!token ? 'Yes (Length: ' + token.length + ')' : 'No'}`);

async function checkPhoneNumbers() {
    if (!wabaId || !token) {
        console.error('ERROR: Missing WABA_ID or WHATSAPP_TOKEN in .env');
        return;
    }

    try {
        const url = `https://graph.facebook.com/v18.0/${wabaId}/phone_numbers`;
        console.log(`Requesting: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('--- SUCCESS ---');
        console.log('Found Phone Numbers:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('--- ERROR ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

checkPhoneNumbers();
