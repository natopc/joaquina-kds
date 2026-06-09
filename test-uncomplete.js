const http = require('http');

const data = JSON.stringify({
    orderId: "PEDIDO_ID_AQUI", 
    itemId: "ITEM_ID_AQUI"
});

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/uncomplete-item',
    method: 'POST',
    headers: {
        'Cookie': 'kds_auth=authenticated',
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
}, (res) => {
    let output = '';
    res.on('data', (d) => { output += d; });
    res.on('end', () => { console.log("Status:", res.statusCode, "Output:", output); });
});

req.write(data);
req.end();
