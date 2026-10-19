import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../../src/app.module';
import { User } from './../../src/modules/users/user.entity';
import { MailService } from './../../src/modules/auth/mail/mail.service';

jest.setTimeout(60000);

describe('Email verification (e2e)', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  const suffix = Date.now();

  const creds = {
    email: `verify-${suffix}@example.com`,
    password: 'VerifyPass1!',
  };

  let capturedTokens: string[] = [];

  const mockMailService = {
    sendVerificationEmail: jest.fn((to: string, token: string) => {
      capturedTokens.push(token);
      return Promise.resolve();
    }),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
    sendSettlementNotification: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mockMailService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const dataSource = app.get(DataSource);
    userRepo = dataSource.getRepository(User);

    await request(app.getHttpServer())
      .post('/v1/users')
      .send(creds)
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('resends a verification email for an unverified account with a generic message', async () => {
    capturedTokens = [];
    mockMailService.sendVerificationEmail.mockClear();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .send({ email: creds.email })
      .expect(200);

    expect(res.body.message).toBe(
      'If an account with that email exists, a verification link has been sent.',
    );
    expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
      creds.email,
      expect.any(String),
    );
    expect(capturedTokens).toHaveLength(1);
  });

  it('the newly issued token verifies via GET /v1/auth/verify-email', async () => {
    const token = capturedTokens[0];
    expect(token).toBeDefined();

    const res = await request(app.getHttpServer())
      .get('/v1/auth/verify-email')
      .query({ token })
      .expect(200);

    expect(res.body.message).toBe(
      'Email verified successfully. You can now log in.',
    );

    const user = await userRepo.findOneBy({ email: creds.email });
    expect(user?.isEmailVerified).toBe(true);
  });

  it('returns the same generic message for a non-existent email', async () => {
    mockMailService.sendVerificationEmail.mockClear();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .send({ email: `nobody-${suffix}@example.com` })
      .expect(200);

    expect(res.body.message).toBe(
      'If an account with that email exists, a verification link has been sent.',
    );
    expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns the same generic message for an already-verified email', async () => {
    mockMailService.sendVerificationEmail.mockClear();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .send({ email: creds.email })
      .expect(200);

    expect(res.body.message).toBe(
      'If an account with that email exists, a verification link has been sent.',
    );
    expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
