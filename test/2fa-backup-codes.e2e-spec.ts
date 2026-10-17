import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User } from './../src/modules/users/user.entity';
import { generateSync } from 'otplib';

jest.setTimeout(60000);

describe('2FA backup codes (e2e)', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  const suffix = Date.now();

  const creds = {
    email: `2fa-backup-${suffix}@example.com`,
    password: 'BackupPass1!',
  };

  let userId: string;
  let token: string;
  let totpSecret: string;
  let originalBackupCodes: string[] = [];
  let regeneratedBackupCodes: string[] = [];

  const loginWithTwoFactorCode = (twoFactorCode: string) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ ...creds, twoFactorCode });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const dataSource = app.get(DataSource);
    userRepo = dataSource.getRepository(User);

    userId = (
      await request(app.getHttpServer())
        .post('/v1/users')
        .send(creds)
        .expect(201)
    ).body.id;
    await userRepo.update(userId, { isEmailVerified: true });

    token = (
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(creds)
        .expect(200)
    ).body.access_token;

    // Regeneration is rejected while 2FA is not enabled
    await request(app.getHttpServer())
      .post('/v1/auth/2fa/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: creds.password })
      .expect(400);

    // Start 2FA setup
    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    totpSecret = enableRes.body.secret;
    originalBackupCodes = enableRes.body.backupCodes;

    // Activate 2FA with a valid TOTP code
    await request(app.getHttpServer())
      .post('/v1/auth/2fa/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: generateSync({ secret: totpSecret }) })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('regenerates a fresh set of 10 backup codes when given a valid password', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/2fa/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: creds.password })
      .expect(201);

    regeneratedBackupCodes = res.body.backupCodes;

    expect(regeneratedBackupCodes).toHaveLength(10);
    for (const code of regeneratedBackupCodes) {
      expect(code).toMatch(/^[a-f0-9]{8}$/);
    }
    expect(regeneratedBackupCodes).not.toEqual(
      expect.arrayContaining(originalBackupCodes),
    );
  });

  it('keeps the TOTP secret unchanged and does not require /2fa/verify again', async () => {
    await loginWithTwoFactorCode(generateSync({ secret: totpSecret })).expect(
      200,
    );
  });

  it('rejects a previously valid backup code after regeneration', async () => {
    await loginWithTwoFactorCode(originalBackupCodes[0]).expect(401);
  });

  it('accepts a newly generated backup code', async () => {
    await loginWithTwoFactorCode(regeneratedBackupCodes[0]).expect(200);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/2fa/backup-codes/regenerate')
      .send({ password: creds.password })
      .expect(401);
  });

  it('rejects regeneration with an invalid password', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/2fa/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'WrongPass1!' })
      .expect(401);
  });

  it('rejects regeneration with an invalid TOTP code', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/2fa/backup-codes/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ twoFactorCode: '000000' })
      .expect(401);
  });
});
