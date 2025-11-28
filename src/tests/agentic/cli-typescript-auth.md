# Test CLI with TypeScript Auth Project

Setup

- Use a clean .simulation directory for this test

Steps:

1. Create an auth.ts file
2. Put in this content:

```typescript
class UserAuth {
  login() {}
}
```

3. Run the query `raggrep query "password"
4. The auth.ts file should be found in the results
