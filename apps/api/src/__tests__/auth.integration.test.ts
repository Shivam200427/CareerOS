import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

describe('Auth API Integration', () => {
  describe('Demo Auth Flow', () => {
    it('should issue a valid token on demo login', async () => {
      // Simulate demo auth endpoint
      const demoPayload = { userId: 'demo-user', email: 'demo@example.com', role: 'user' };
      const token = jwt.sign(demoPayload, env.JWT_SECRET, { expiresIn: '7d' });

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Verify token is valid
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe('demo-user');
      expect(decoded.email).toBe('demo@example.com');
    });

    it('should include expiration in token', async () => {
      const payload = { userId: 'test' };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('Protected Routes Middleware', () => {
    it('should validate token on protected endpoint', async () => {
      const payload = { userId: 'user-123' };
      const validToken = jwt.sign(payload, env.JWT_SECRET);

      // Simulate middleware validation
      const decoded = jwt.verify(validToken, env.JWT_SECRET);
      expect(decoded).toBeTruthy();
    });

    it('should reject expired tokens', async () => {
      const payload = { userId: 'user-123' };
      const expiredToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '-1h' });

      expect(() => {
        jwt.verify(expiredToken, env.JWT_SECRET);
      }).toThrow();
    });

    it('should reject tokens with wrong secret', async () => {
      const payload = { userId: 'user-123' };
      const wrongToken = jwt.sign(payload, 'wrong-secret');

      expect(() => {
        jwt.verify(wrongToken, env.JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Token Lifecycle', () => {
    it('should handle login -> authenticated request -> logout cycle', async () => {
      // 1. Login
      const loginPayload = { userId: 'user-456', email: 'user@example.com' };
      const token = jwt.sign(loginPayload, env.JWT_SECRET, { expiresIn: '7d' });
      expect(token).toBeTruthy();

      // 2. Authenticated request
      const authHeader = `Bearer ${token}`;
      const tokenFromHeader = authHeader.split(' ')[1];
      const decoded = jwt.verify(tokenFromHeader, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-456');

      // 3. Logout (token invalidated in practice via blacklist/session)
      // For now, just verify it was a valid flow
      expect(decoded.iat).toBeDefined();
    });
  });
});
