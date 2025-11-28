import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

// OAuth2 Client configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
);

// Scopes needed for Gmail and Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * Generate the URL for user to authenticate with Google
 */
export function getAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Get OAuth2 client with credentials
 */
export function getOAuth2Client(accessToken: string, refreshToken?: string): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  // Auto-refresh access token when it expires
  client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      console.log('New refresh token received');
    }
    if (tokens.access_token) {
      console.log('Access token refreshed');
      // TODO: Update the database with new access token
    }
  });

  return client;
}

/**
 * Get user info from Google
 */
export async function getUserInfo(accessToken: string, refreshToken?: string) {
  const client = getOAuth2Client(accessToken, refreshToken);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/**
 * Get OAuth2 client with automatic token refresh
 */
export async function getOAuth2ClientWithRefresh(accessToken: string, refreshToken?: string, userId?: string): Promise<OAuth2Client> {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  // Try to refresh token if access token is expired
  try {
    await client.getAccessToken();
  } catch (error) {
    console.log('Access token expired, attempting refresh...');
    if (refreshToken) {
      try {
        const { credentials } = await client.refreshAccessToken();
        console.log('Token refreshed successfully');
        
        // Update database with new tokens if userId is provided
        if (userId && credentials.access_token) {
          const { storage } = await import('./storage');
          await storage.updateUser(userId, {
            googleAccessToken: credentials.access_token,
            googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined
          });
        }
        
        return client;
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        throw new Error('Authentication failed - please re-login');
      }
    } else {
      throw new Error('No refresh token available - please re-login');
    }
  }

  return client;
}

