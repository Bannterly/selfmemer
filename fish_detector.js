const sharp  = require('sharp');
const https  = require('https');
const http   = require('http');

async function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadBuffer(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for image URL`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end',  ()  => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
    });
}

async function detectFish(imageUrl) {
    const buffer = await downloadBuffer(imageUrl);

    const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const cellW = Math.floor(width  / 3);
    const cellH = Math.floor(height / 3);

    const cells = [];

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x0 = col * cellW;
            const y0 = row * cellH;
            const x1 = Math.min(x0 + cellW, width);
            const y1 = Math.min(y0 + cellH, height);

            let sumBright = 0, sumR = 0, sumG = 0, sumB = 0, count = 0;

            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const idx = (y * width + x) * channels;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    sumBright += 0.299 * r + 0.587 * g + 0.114 * b;
                    sumR += r;
                    sumG += g;
                    sumB += b;
                    count++;
                }
            }

            const avgBrightness = sumBright / count;
            const avgR = sumR / count;
            const avgG = sumG / count;
            const avgB = sumB / count;

            // Mine detection: mines are non-blue (skull/grey icons with high R or equal RGB).
            // Normal water tiles are predominantly blue. Fish shadows are dark blue.
            // If red is clearly dominant over blue, or green clearly dominates, treat as mine.
            const isMine = (avgR > avgB + 25) || (avgG > avgB + 25 && avgR > 35);

            cells.push({ row, col, index: row * 3 + col, avgBrightness, avgR, avgG, avgB, isMine });
        }
    }

    // Prefer non-mine cells; sort by brightness ascending (darkest = fish shadow)
    const candidates = cells.filter(c => !c.isMine);
    const pool = candidates.length > 0 ? candidates : cells;
    pool.sort((a, b) => a.avgBrightness - b.avgBrightness);

    return pool[0];
}

module.exports = { detectFish };
