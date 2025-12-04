/**
 * OAuth/SSO Authentication Module
 *
 * Handles OAuth 2.0 and Single Sign-On authentication flows.
 * Supports Google, GitHub, and custom OIDC providers.
 */

import { sign } from "jsonwebtoken";

export interface OAuthProvider {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  provider: string;
}

export interface SSOSession {
  sessionId: string;
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

// Supported OAuth providers
const providers: Record<string, OAuthProvider> = {
  google: {
    id: "google",
    name: "Google",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
  },
  github: {
    id: "github",
    name: "GitHub",
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["user:email"],
  },
};

const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

/**
 * Generate OAuth authorization URL for a provider
 */
export function getAuthorizationUrl(
  providerId: string,
  redirectUri: string,
  state: string
): string {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
  });

  return `${provider.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  providerId: string,
  code: string,
  redirectUri: string
): Promise<OAuthTokenResponse> {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch user info from OAuth provider
 */
export async function fetchUserInfo(
  providerId: string,
  accessToken: string
): Promise<OAuthUserInfo> {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const response = await fetch(provider.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const data = await response.json();

  // Normalize user info across providers
  return {
    id: data.id || data.sub,
    email: data.email,
    name: data.name || data.login,
    picture: data.picture || data.avatar_url,
    provider: providerId,
  };
}

/**
 * Handle OAuth callback and create local session
 */
export async function handleOAuthCallback(
  providerId: string,
  code: string,
  redirectUri: string,
  userRepository: OAuthUserRepository
): Promise<{ token: string; user: OAuthUserInfo }> {
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(providerId, code, redirectUri);

  // Fetch user info
  const userInfo = await fetchUserInfo(providerId, tokens.access_token);

  // Find or create user
  let user = await userRepository.findByOAuthId(providerId, userInfo.id);

  if (!user) {
    // Check if user exists with same email
    user = await userRepository.findByEmail(userInfo.email);

    if (user) {
      // Link OAuth account to existing user
      await userRepository.linkOAuthAccount(user.id, providerId, userInfo.id);
    } else {
      // Create new user
      user = await userRepository.createFromOAuth(userInfo);
    }
  }

  // Generate JWT token
  const token = sign(
    {
      userId: user.id,
      email: user.email,
      provider: providerId,
    },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  return { token, user: userInfo };
}

/**
 * Validate SSO session
 */
export function validateSSOSession(session: SSOSession): boolean {
  if (!session || !session.sessionId) {
    return false;
  }

  if (new Date() > session.expiresAt) {
    return false;
  }

  return true;
}

/**
 * Refresh OAuth tokens
 */
export async function refreshOAuthTokens(
  providerId: string,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  return response.json();
}

// Repository interface for OAuth user operations
interface OAuthUserRepository {
  findByOAuthId(
    provider: string,
    oauthId: string
  ): Promise<{ id: string; email: string } | null>;
  findByEmail(email: string): Promise<{ id: string; email: string } | null>;
  linkOAuthAccount(
    userId: string,
    provider: string,
    oauthId: string
  ): Promise<void>;
  createFromOAuth(
    userInfo: OAuthUserInfo
  ): Promise<{ id: string; email: string }>;
}
