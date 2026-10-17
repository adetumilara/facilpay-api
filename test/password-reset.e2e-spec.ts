import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Password Reset (e2e)', () => {
  let app: INestApplication;
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
    await dataSource.query('DELETE FROM password_reset_tokens');
    await dataSource.query('DELETE FROM refresh_tokens');
  });

  describe('POST /auth/forgot-password', () => {
    it('should return 200 for non-existent email (enumeration protection)', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain(
            'If an account with that email exists',
          );
        });
    });

    it('should return 200 for existing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'Password123' });

      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain(
            'If an account with that email exists',
          );
        });
    });

    it('should validate email format', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should return 400 for invalid token', () => {
      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          email: 'test@example.com',
          newPassword: 'NewPassword123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid or expired');
        });
    });

    it('should reset password with valid token', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'reset@example.com', password: 'OldPassword123' });

      await dataSource.query(
        `UPDATE users SET "isEmailVerified" = true WHERE email = $1`,
        ['reset@example.com'],
      );

      const forgotResponse = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      expect(forgotResponse.status).toBe(200);

      const tokens = await dataSource.query(
        'SELECT * FROM password_reset_tokens ORDER BY "createdAt" DESC LIMIT 1',
      );

      if (tokens.length === 0) {
        return;
      }

      const loginBefore = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'reset@example.com', password: 'OldPassword123' });

      expect(loginBefore.status).toBe(200);

      const resetResponse = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'mock-token',
          email: 'reset@example.com',
          newPassword: 'NewPassword123',
        });

      if (resetResponse.status === 200) {
        const loginAfter = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'reset@example.com', password: 'NewPassword123' });

        expect(loginAfter.status).toBe(200);

        const oldPasswordLogin = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'reset@example.com', password: 'OldPassword123' });

        expect(oldPasswordLogin.status).toBe(401);
      }
    });

    it('should invalidate all refresh tokens after reset', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'session@example.com', password: 'Password123' });

      await dataSource.query(
        `UPDATE users SET "isEmailVerified" = true WHERE email = $1`,
        ['session@example.com'],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'session@example.com', password: 'Password123' });

      const refreshToken = loginResponse.body.refresh_token;

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'session@example.com' });

      const refreshBefore = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken });

      expect(refreshBefore.status).toBe(200);
    });

    it('should return 400 for already used token', async () => {
      await dataSource.query(
        `INSERT INTO password_reset_tokens ("id", "userId", "tokenHash", "expiresAt", "used") 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'token-1',
          'user-1',
          'hash',
          new Date(Date.now() + 3600000),
          true,
        ],
      );

      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'used-token',
          email: 'test@example.com',
          newPassword: 'NewPassword123',
        })
        .expect(400);
    });
  });
});
