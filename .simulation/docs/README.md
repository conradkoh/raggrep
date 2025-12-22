# Simulation Project

A sample project for testing RAGgrep search functionality.

## Overview

This project contains a realistic codebase structure for testing semantic search capabilities:

- **Authentication** - User login, session management, JWT tokens
- **Database** - PostgreSQL connection pool and user models
- **API** - Express REST endpoints with middleware
- **Utilities** - Logging, validation helpers

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis (for session storage)

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Required environment variables:

| Variable       | Description                  |
| -------------- | ---------------------------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`   | Secret key for JWT signing   |
| `REDIS_URL`    | Redis connection string      |

### Running the Server

```bash
npm run dev
```

The server starts on `http://localhost:3000` by default.

## API Documentation

See [API.md](./API.md) for detailed endpoint documentation.

## Architecture

The project follows a layered architecture:

```
src/
├── api/           # HTTP layer (routes, middleware)
├── auth/          # Authentication logic
├── database/      # Data access layer
└── utils/         # Shared utilities
```

## Testing

```bash
npm test
```

## License

MIT





