require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const { exec } = require('child_process');

const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const port = 53682;
const redirect = `http://127.0.0.1:${port}/oauth/callback`;

if (!clientId || !clientSecret) {
  console.error('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, then run this again.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirect);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirect);
  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('Sign-in did not finish. Close this tab and run npm run gmail-auth again.');
    console.error(url.searchParams.get('error') || 'Google did not return a code.');
    server.close();
    process.exit(1);
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = await tokenRes.json();
  if (!token.refresh_token) {
    res.end('No refresh token. Remove this app under Google Account permissions, then run npm run gmail-auth again.');
    console.error(token.error_description || token.error || 'Google did not return a refresh token.');
    server.close();
    process.exit(1);
  }

  res.end('Refresh token is in the terminal. You can close this tab.');
  console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}`);
  server.close();
  process.exit(0);
});

server.listen(port, '127.0.0.1', () => {
  console.log('Sign in with the same Gmail account stored in GMAIL_USER.');
  console.log(authUrl.toString());
  exec(`start "" "${authUrl.toString()}"`);
});

setTimeout(() => {
  console.error('Timed out waiting for Google sign-in.');
  server.close();
  process.exit(1);
}, 5 * 60 * 1000);
