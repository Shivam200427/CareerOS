import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

describe('Auth Module', () => {
  it('should generate a valid JWT token', () => {
    const payload = { userId: '123', email: 'test@example.com' };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
    
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('should decode a valid JWT token', () => {
    const payload = { userId: '123', email: 'test@example.com' };
    const token = jwt.sign(payload, env.JWT_SECRET);
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    
    expect(decoded.userId).toBe('123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('should reject an invalid token', () => {
    const invalidToken = 'invalid.token.here';
    
    expect(() => {
      jwt.verify(invalidToken, env.JWT_SECRET);
    }).toThrow();
  });

  it('should reject a token signed with wrong secret', () => {
    const payload = { userId: '123' };
    const wrongSecret = 'wrong-secret-key';
    const token = jwt.sign(payload, wrongSecret);
    
    expect(() => {
      jwt.verify(token, env.JWT_SECRET);
    }).toThrow();
  });

  it('JWT_SECRET should be present and valid', () => {
    expect(env.JWT_SECRET).toBeTruthy();
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });
});
