const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, WABA_ID, VERSION } = process.env;

async function checkSubscriptions() {
    console.log('--- CHECKING SUBSCRIPTIONS ---');
    console.log(`WABA ID: ${WABA_ID}`);

    const url = `https://graph.facebook.com/${VERSION || 'v18.0'}/${WABA_ID}/subscribed_apps`;
    
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            }
        });

        console.log('Response status:', response.status);
        if (response.data && response.data.data) {
            console.log('Subscribed Apps:', JSON.stringify(response.data.data, null, 2));
            if (response.data.data.length === 0) {
                console.error('⚠️ NO APPS SUBSCRIBED! You must subscribe the app to the WABA.');
            }
        } else {
            console.log('Unexpected response:', response.data);
        }

    } catch (error) {
        console.error('Error fetching subscriptions:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.data.error.code === 100) {
                console.log('Tip: This usually means the Token lacks permission to read WABA settings.');
            }
        } else {
            console.error(error.message);
        }
    }
}

checkSubscriptions();