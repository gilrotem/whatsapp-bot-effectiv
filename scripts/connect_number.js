const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');

const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_NUMBER_ID;

async function connectNumber() {
    console.log(`Attempting to CONNECT (Register) phone ID: ${phoneId}`);

    try {
        // Step 1: Try to register directly
        // Note: 'pin' is required if Two-Step verification is enabled. 
        // We will try without first, relying on migration flows, or catch the error asking for PIN.
        
        const url = `https://graph.facebook.com/v18.0/${phoneId}/register`;
        const body = {
            messaging_product: 'whatsapp',
            pin: '100122'
        };
        
        const config = {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json' 
            }
        };

        console.log('Sending register request...');
        const response = await axios.post(url, body, config);
        
        console.log('--- SUCCESS ---');
        console.log('Number successfully connected!', response.data);

    } catch (error) {
        console.log('--- REGISTRATION FAILED ---');
        if (error.response) {
            console.log('Error Data:', JSON.stringify(error.response.data, null, 2));   
            const code = error.response.data.error.code;
            
            if (code === 131053) {
                 console.log("\n[!] STATUS: The number is already registered or verification is pending.");
            } else if (code === 131008 || code === 131009) {
                 console.log("\n[!] PIN REQUIRED: The generic PIN failed. We need the real 6-digit Two-Step Verification PIN.");
            }
        } else {
            console.log('Error:', error.message);
        }
    }
}

connectNumber();