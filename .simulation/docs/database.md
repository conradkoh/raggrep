# Database Guide

This document covers database setup, configuration, and best practices.

## PostgreSQL Setup

### Installation

```bash
# macOS
brew install postgresql@14

# Ubuntu
sudo apt install postgresql-14
```

### Creating the Database

```bash
createdb myapp_dev
createdb myapp_test
```

## Connection Pool

The application uses a connection pool to efficiently manage database connections.

### Configuration

| Setting          | Default | Description             |
| ---------------- | ------- | ----------------------- |
| `maxConnections` | 20      | Maximum pool size       |
| `idleTimeoutMs`  | 30000   | Idle connection timeout |

### Usage

```typescript
import { executeQuery, executeTransaction } from "./database/connection";

// Simple query
const users = await executeQuery<User>(
  "SELECT * FROM users WHERE active = $1",
  [true]
);

// Transaction
await executeTransaction(async (client) => {
  await client.query(
    "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
    [100, fromId]
  );
  await client.query(
    "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
    [100, toId]
  );
});
```

## Schema

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Migrations

Migrations are managed using a simple SQL-based approach:

```bash
# Run pending migrations
npm run db:migrate

# Create new migration
npm run db:migrate:create add_phone_to_users
```

## Performance Tips

1. **Index frequently queried columns** - Add indexes on columns used in WHERE clauses
2. **Use connection pooling** - Never create new connections per request
3. **Batch operations** - Use transactions for multiple related operations
4. **Monitor slow queries** - Enable query logging in development

## Troubleshooting

### Connection refused

- Ensure PostgreSQL is running
- Check connection string in `.env`
- Verify firewall settings

### Pool exhausted

- Increase `maxConnections` if needed
- Check for connection leaks (unreleased clients)
- Review long-running queries





