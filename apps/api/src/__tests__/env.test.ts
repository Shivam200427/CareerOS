import { describe, it, expect } from 'vitest';
import { env } from '../env.js';

describe('Environment Configuration', () => {
  it('should load API_PORT from environment', () => {
    expect(env.API_PORT).toBe(4000);
    expect(typeof env.API_PORT).toBe('number');
  });

  it('should load JWT_SECRET from environment', () => {
    expect(env.JWT_SECRET).toBeTruthy();
    expect(typeof env.JWT_SECRET).toBe('string');
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it('should load FRONTEND_URL from environment', () => {
    expect(env.FRONTEND_URL).toBeTruthy();
    expect(env.FRONTEND_URL).toContain('http');
  });

  it('should load REDIS_URL from environment', () => {
    expect(env.REDIS_URL).toBeTruthy();
    expect(env.REDIS_URL).toContain('redis');
  });

  it('should load JOB_QUEUE_NAME from environment', () => {
    expect(env.JOB_QUEUE_NAME).toBe('job-apply-queue');
  });

  it('should have all required environment variables', () => {
    const requiredFields = ['API_PORT', 'JWT_SECRET', 'FRONTEND_URL', 'REDIS_URL'];
    requiredFields.forEach(field => {
      expect(env).toHaveProperty(field);
    });
  });
});
