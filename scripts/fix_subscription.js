const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, WABA_ID, VERSION } = process.env;

async function fixSubscription() {
    console.log('--- FIXING SUBSCRIPTION ---');
    console.log(`Target WABA ID: ${WABA_ID}`);

    // Step 1: Check who owns the token
    try {
        const meRes = await axios.get(`https://graph.facebook.com/v18.0/me?fields=name,id,permissions`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        console.log('Token belongs to User:', meRes.data.name, `(ID: ${meRes.data.id})`);
    } catch (e) {
        console.log('Could not verify token owner (Warning only)');
    }

    // Step 2: Subscribe
    const url = `https://graph.facebook.com/${VERSION || 'v18.0'}/${WABA_ID}/subscribed_apps`;
    
    try {
        console.log(`Attempting to subscribe to 'messages' field...`);
        
        const response = await axios.post(url, {
            subscribed_fields: ['messages']
        }, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            }
        });

        console.log('SUCCESS! Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('FAILED to subscribe.');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
            
            // Analyze specific permission errors
            if (error.response.data.error.code === 200) {
                console.log('\nDIAGNOSIS: Permission error. The System User needs "whatsapp_business_management" permission.');
            }
        } else {
            console.error(error.message);
        }
    }
}

fixSubscription();