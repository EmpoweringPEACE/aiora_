import { createServer } from 'net';
import { randomInt } from 'crypto';
import open from 'open';

const CLIENT_ID = 'wVXirU67slk25MMh9F3LfQ';
const CLIENT_SECRET = 'nokw6uSJIT8ZWgfAPht7pTtLddjhQ';
const REDIRECT_URI = 'http://localhost:8080';
const USER_AGENT = 'AgentAiora/1.0.0';

// Equivalent to receive_connection()
function createSocketServer() {
    return new Promise((resolve) => {
        const server = createServer((socket) => {
            server.close();
            resolve(socket);
        });
        
        server.listen(8080, 'localhost');
    });
}

// Equivalent to send_message()
function sendResponse(socket, message) {
    console.log(message);
    socket.write(`HTTP/1.1 200 OK\r\n\r\n${message}`);
    socket.end();
}

async function main() {
    // Get scopes from user
    const scopes = ['identity', 'edit', 'submit', 'read', 'vote', 'history'];
    
    // Generate state for security
    const state = randomInt(0, 65000).toString();
    
    // Create authorization URL
    const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('duration', 'permanent');
    authUrl.searchParams.append('scope', scopes.join(' '));

    console.log('Opening browser to:', authUrl.toString());
    console.log('Make sure your Reddit app settings has this exact redirect URI:', REDIRECT_URI);
    open(authUrl.toString());

    // Wait for callback
    const socket = await createSocketServer();
    
    // Handle incoming data
    socket.on('data', async (data) => {
        const request = data.toString();
        try {
            const urlParams = new URLSearchParams(request.split(' ')[1].split('?')[1]);
            
            // Verify state
            if (state !== urlParams.get('state')) {
                sendResponse(socket, `State mismatch. Expected: ${state} Received: ${urlParams.get('state')}`);
                process.exit(1);
            }

            if (urlParams.has('error')) {
                sendResponse(socket, urlParams.get('error'));
                process.exit(1);
            }

            // Exchange code for tokens
            const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': USER_AGENT
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: urlParams.get('code'),
                    redirect_uri: REDIRECT_URI
                })
            });

            const data = await tokenResponse.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            const message = `
                <html>
                    <body>
                        <h1>Reddit OAuth2 Tokens</h1>
                        <p>Add this to your .env file:</p>
                        <pre>REDDIT_REFRESH_TOKEN=${data.refresh_token}</pre>
                        <p>You can now close this window.</p>
                    </body>
                </html>
            `;
            
            sendResponse(socket, message);
            console.log('\nRefresh token:', data.refresh_token);
            console.log('\nAdd this to your .env file:');
            console.log(`REDDIT_REFRESH_TOKEN=${data.refresh_token}`);
            
            process.exit(0);
        } catch (error) {
            sendResponse(socket, `Error: ${error.message}`);
            console.error('Error:', error);
            process.exit(1);
        }
    });
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
}); 