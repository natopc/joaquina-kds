const http = require('http');
const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/stream',
    headers: {
        'Cookie': 'kds_auth=authenticated'
    }
}, (res) => {
    res.on('data', (d) => {
        console.log(d.toString());
        process.exit(0);
    });
});
req.end();
