const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;

async function forceSubscribe() {
    try {
        // Step 1: Get the WhatsApp Business Account ID (WABA ID) from the Phone Number ID
        console.log('Fetching WABA ID...');
        const phoneResponse = await axios.get(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
            params: { fields: 'id, name, whatsapp_business_account' }
        });
        
        const wabaId = phoneResponse.data.whatsapp_business_account.id;
        console.log(`Found WABA ID: ${wabaId}`);

        // Step 2: List current subscriptions
        console.log('Checking current subscriptions...');
        const subsResponse = await axios.get(`https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`, {
             headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        console.log('Current Subscriptions:', JSON.stringify(subsResponse.data, null, 2));

        // Step 3: Subscribe/Override
        console.log('Force subscribing app to WABA events...');
        const subscribeUrl = `https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`;
        const subscribeResponse = await axios.post(subscribeUrl, {}, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });

        console.log('--- SUBSCRIPTION RESULT ---');
        console.log('Success:', subscribeResponse.data.success);
        console.log('Note: This action forces the API to route messages to the webhook defined in your App Dashboard.');

    } catch (error) {
        console.error('Error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

forceSubscribe();