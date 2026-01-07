const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');

const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.PHONE_NUMBER_ID;

async function checkRealStatus() {
    console.log(`Checking status for Phone ID: ${phoneId}`);

    try {
        const url = `https://graph.facebook.com/v18.0/${phoneId}`;
        const config = {
            headers: { 'Authorization': `Bearer ${token}` }
        };

        const response = await axios.get(url, config);
        const data = response.data;

        console.log('--- LIVE STATUS FROM API ---');
        console.log(`Phone Number: ${data.display_phone_number}`);
        console.log(`Status: ${data.code_verification_status}`); // Should be 'VERIFIED'
        console.log(`Name Status: ${data.name_status}`);
        console.log(`Quality Rating: ${data.quality_rating}`);
        console.log(`Platform Type: ${data.platform_type}`); // Should be 'CLOUD_API'
        
        // Let's also check the registered field specifically if available in fields
        const regUrl = `https://graph.facebook.com/v18.0/${phoneId}?fields=name,code_verification_status,is_online,platform_type,last_onboarded_time`;
        const regResponse = await axios.get(regUrl, config);
        console.log('\n--- DETAILED DETAILS ---');
        console.log(JSON.stringify(regResponse.data, null, 2));

    } catch (error) {
        console.error('Error fetching status:', error.response ? error.response.data : error.message);
    }
}

checkRealStatus();