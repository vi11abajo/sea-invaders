import axios from 'axios';
import { discordConfig } from '../config/discord.js';

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code, redirectUri = null) {
  try {
    const finalRedirectUri = redirectUri || discordConfig.redirectUri;

    const response = await axios.post(
      discordConfig.tokenUrl,
      new URLSearchParams({
        client_id: discordConfig.clientId,
        client_secret: discordConfig.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: finalRedirectUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Discord token exchange error:', error.response?.data || error.message);
    throw new Error('Failed to exchange code for token');
  }
}

/**
 * Get user data from Discord
 */
export async function getUserData(accessToken) {
  try {
    const response = await axios.get(discordConfig.userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Discord user data error:', error.response?.data || error.message);
    throw new Error('Failed to fetch user data from Discord');
  }
}

/**
 * Create URL for Discord authorization
 */
export function getAuthorizationUrl(state = null, origin = null) {
  // If origin is passed, form redirect_uri based on it
  const redirectUri = origin
    ? `${origin}/api/auth/discord/callback`
    : discordConfig.redirectUri;

  console.log('🔐 Creating Discord auth URL:', { origin, redirectUri });

  const params = new URLSearchParams({
    client_id: discordConfig.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: discordConfig.scopes.join(' '),
  });

  if (state) {
    params.append('state', state);
  }

  return `${discordConfig.authUrl}?${params.toString()}`;
}

export default {
  exchangeCodeForToken,
  getUserData,
  getAuthorizationUrl,
};
