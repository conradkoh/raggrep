-- Seed data for development environment
-- Run with: psql -d myapp_dev -f scripts/seed-data.sql

-- Insert test users
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'admin@example.com', '$2b$10$hash1...', 'Admin', 'User', 'admin', true),
  ('550e8400-e29b-41d4-a716-446655440002', 'john@example.com', '$2b$10$hash2...', 'John', 'Doe', 'user', true),
  ('550e8400-e29b-41d4-a716-446655440003', 'jane@example.com', '$2b$10$hash3...', 'Jane', 'Smith', 'user', true)
ON CONFLICT (id) DO NOTHING;

-- Insert test sessions
INSERT INTO sessions (id, user_id, expires_at, metadata)
VALUES 
  ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', NOW() + INTERVAL '24 hours', '{"userAgent": "Mozilla/5.0", "ipAddress": "127.0.0.1"}'),
  ('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', NOW() + INTERVAL '24 hours', '{"userAgent": "Mozilla/5.0", "ipAddress": "127.0.0.1"}')
ON CONFLICT (id) DO NOTHING;

-- Display inserted data
SELECT 'Users:' as info;
SELECT id, email, first_name, last_name, role FROM users;

SELECT 'Sessions:' as info;
SELECT id, user_id, expires_at FROM sessions;




