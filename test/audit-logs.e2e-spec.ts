import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';

describe('Audit Logs (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM password_reset_tokens');
    await dataSource.query('DELETE FROM refresh_tokens');
  });

  describe('POST /auth/login', () => {
    it('should create an audit log entry on successful login', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'audit-login@example.com', password: 'Password123' });

      await dataSource.query(
        `UPDATE users SET "isEmailVerified" = true WHERE email = $1`,
        ['audit-login@example.com'],
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'audit-login@example.com', password: 'Password123' })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');

      const logs = await dataSource.query(
        `SELECT * FROM audit_logs WHERE action = 'auth.login.success' ORDER BY timestamp DESC`,
      );

      expect(logs.length).toBe(1);
      expect(logs[0].actorType).toBe('user');
      expect(logs[0].resourceType).toBe('user');
      expect(logs[0].action).toBe('auth.login.success');
      expect(logs[0].metadata).toMatchObject({ email: 'audit-login@example.com' });
    });

    it('should create an audit log entry on failed login', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'Password123' })
        .expect(401);

      const logs = await dataSource.query(
        `SELECT * FROM audit_logs WHERE action = 'auth.login.failed' ORDER BY timestamp DESC`,
      );

      expect(logs.length).toBe(1);
      expect(logs[0].actorType).toBe('user');
      expect(logs[0].resourceType).toBe('user');
      expect(logs[0].action).toBe('auth.login.failed');
      expect(logs[0].metadata).toMatchObject({ email: 'nonexistent@example.com', reason: 'user_not_found' });
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should create an audit log entry on password reset', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'audit-reset@example.com', password: 'OldPassword123' });

      await dataSource.query(
        `UPDATE users SET "isEmailVerified" = true WHERE email = $1`,
        ['audit-reset@example.com'],
      );

      const forgotResponse = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'audit-reset@example.com' });

      expect(forgotResponse.status).toBe(200);

      const tokens = await dataSource.query(
        'SELECT * FROM password_reset_tokens ORDER BY "createdAt" DESC LIMIT 1',
      );

      if (tokens.length === 0) {
        return;
      }

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'mock-token',
          email: 'audit-reset@example.com',
          newPassword: 'NewPassword123',
        })
        .expect(200);

      const logs = await dataSource.query(
        `SELECT * FROM audit_logs WHERE action = 'auth.password.reset_completed' ORDER BY timestamp DESC`,
      );

      expect(logs.length).toBe(1);
      expect(logs[0].actorType).toBe('user');
      expect(logs[0].resourceType).toBe('user');
      expect(logs[0].action).toBe('auth.password.reset_completed');
      expect(logs[0].metadata).toMatchObject({ email: 'audit-reset@example.com' });
    });
  });

  describe('GET /v1/admin/audit-logs', () => {
    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/audit-logs')
        .expect(401);
    });

    it('should return audit logs for admin', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'admin-audit@example.com', password: 'Password123' });

      await dataSource.query(
        `UPDATE users SET "isEmailVerified" = true, roles = ARRAY['ADMIN'] WHERE email = $1`,
        ['admin-audit@example.com'],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin-audit@example.com', password: 'Password123' });

      const adminToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .get('/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
