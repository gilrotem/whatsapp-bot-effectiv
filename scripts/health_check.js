const axios = require('axios');
require('dotenv').config();

async function main() {
  const base = process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3002);
  const url = base.replace(/\/$/, '') + '/healthz';
  try {
    const res = await axios.get(url, { timeout: 8000 });
    console.log('GET', url, '→', res.status);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('Error', err.response.status, err.response.data);
    } else {
      console.error('Request failed:', err.message);
    }
    process.exit(1);
  }
}

main();
