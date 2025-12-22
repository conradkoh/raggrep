# Authentication Guide

This document describes how authentication works in the application.

## Overview

The application uses JWT (JSON Web Tokens) for authentication. Tokens are issued
upon successful login and must be included in subsequent requests.

## Login Flow

1. User submits email and password to `/api/users/login`
2. Server validates credentials against database
3. If valid, server generates a JWT token
4. Token is returned to client with expiration time
5. Client stores token and includes it in subsequent requests

## Token Structure

The JWT payload contains:

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234654290
}
```

## Using the Token

Include the token in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Password Requirements

Passwords must meet the following criteria:

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

## Session Management

Sessions are stored in Redis with a 24-hour TTL. Users can:

- View active sessions
- Logout from a specific session
- Logout from all sessions ("logout everywhere")

## Security Considerations

- Passwords are hashed using bcrypt with 10 salt rounds
- JWTs expire after 24 hours
- Failed login attempts are logged for security monitoring
- Rate limiting is applied to prevent brute force attacks

## Troubleshooting

### "Invalid credentials" error

- Verify email address is correct
- Check password meets requirements
- Ensure account is not deactivated

### "Token expired" error

- Re-authenticate to get a new token
- Check client-side token refresh logic

### "Authentication required" error

- Ensure token is included in Authorization header
- Verify token format: `Bearer <token>`





