const http = require('http');

function postLog(source, level, msg) {
    const body = JSON.stringify({ source, level, msg });
    const req  = http.request({
        hostname: '127.0.0.1',
        port:     5000,
        path:     '/api/log',
        method:   'POST',
        headers:  {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
}

module.exports = { postLog };
