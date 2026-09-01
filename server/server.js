/**
 * server.js
 *
 * A deliberately tiny static Web server for the Wolfie Lists application. It has
 * no third-party dependencies at all, it only uses what ships with Node.js, so
 * `npm start` works without ever running `npm install`.
 *
 * Everything inside the public directory is served as-is. The application itself
 * is a Single Page Application, so this server never does any rendering, it just
 * hands files to the browser.
 *
 * @author CSE 316 - Stony Brook University
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(THIS_DIR, '..', 'public');
const PORT = Number(process.env.PORT) || 9000;
const HOST = process.env.HOST || 'localhost';

/**
 * Maps file extensions onto the Content-Type header value the browser needs in
 * order to correctly interpret the bytes we are sending it. Note that .js files
 * MUST be served as JavaScript or the browser will refuse to load our ES modules.
 */
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8'
};

/**
 * Turns a request URL into an absolute path inside the public directory, refusing
 * anything that tries to escape it, i.e. a path traversal attack like /../../secrets.
 *
 * @param {string} requestUrl the raw url off of the incoming request
 * @return {string|null} an absolute file path, or null if the request is illegal
 */
function resolveRequestedFile(requestUrl) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}`).pathname);
    } catch {
        return null;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const absolutePath = path.resolve(PUBLIC_DIR, '.' + pathname);
    const isInsidePublic = absolutePath === PUBLIC_DIR
        || absolutePath.startsWith(PUBLIC_DIR + path.sep);
    return isInsidePublic ? absolutePath : null;
}

function sendPlain(response, statusCode, message) {
    response.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(message)
    });
    response.end(message);
}

const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendPlain(response, 405, '405 Method Not Allowed');
        return;
    }

    const filePath = resolveRequestedFile(request.url);
    if (filePath === null) {
        sendPlain(response, 403, '403 Forbidden');
        return;
    }

    try {
        const contents = await readFile(filePath);
        const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()]
            || 'application/octet-stream';
        response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': contents.length,
            // while developing we never want the browser serving us a stale file
            'Cache-Control': 'no-store'
        });
        response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            console.warn(`  404 ${request.url}`);
            sendPlain(response, 404, `404 Not Found: ${request.url}`);
        } else {
            console.error(`  500 ${request.url}`, error);
            sendPlain(response, 500, '500 Internal Server Error');
        }
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('  Wolfie Lists is being served from:');
    console.log(`    ${PUBLIC_DIR}`);
    console.log('');
    console.log(`  Open the application at http://${HOST}:${PORT}`);
    console.log('  Press Ctrl+C to stop the server.');
    console.log('');
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n  Port ${PORT} is already in use. Either stop the other program`);
        console.error(`  or start this one on a different port, i.e. PORT=9001 npm start\n`);
        process.exit(1);
    }
    throw error;
});
