const axios = require('axios');
require('dotenv').config();

const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;

async function debugAccount() {
    console.log('--- DEBUGGING ACCOUNT INFO ---');
    try {
        // Method 1: Get Token Info (Debug Token)
        console.log('\n[1] Checking Token Scopes & Granular Scopes...');
        const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${WHATSAPP_TOKEN}`;
        // Note: checking debug_token usually requires an app access token or the same user token, 
        // but let's try calling 'me' first as it's safer.
        
        const me = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name,accounts,permissions`, {
             headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        console.log('User ID:', me.data.id);
        console.log('User Name:', me.data.name);
        
        // Method 2: Inspect Phone Number details with fewer fields
        console.log('\n[2] Inspecting Phone ID Minimal Fields...');
        const phone = await axios.get(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        console.log('Phone Data:', JSON.stringify(phone.data, null, 2));

        // Method 3: Try to find WABA from Business Manager API if possible
        // Often WABA ID is embedded in the phone response if we don't ask for specific fields
        
    } catch (error) {
        console.error('Error fetching info:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    }
}

debugAccount();