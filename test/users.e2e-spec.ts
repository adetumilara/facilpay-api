import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('UsersModule (e2e)', () => {
  let app: INestApplication<App>;
  let jwtToken: string;
  let userId: string;

  const testUser = {
    email: 'test@example.com',
    password: 'password123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/users (POST) - Create a user independently', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/users')
      .send(testUser)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.email).toBe(testUser.email);
    expect(response.body).not.toHaveProperty('password');
    userId = response.body.id;
  });

  it('/v1/auth/login (POST) - Login with created user', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(testUser)
      .expect(200);

    expect(response.body).toHaveProperty('access_token');
    jwtToken = response.body.access_token;
  });

  it('/v1/users (GET) - Get all users paginated (Protected)', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/users?page=1&limit=2')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('page');
    expect(response.body).toHaveProperty('limit');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBeLessThanOrEqual(100);
  });

  it('/v1/users (GET) - Filter users by email (Protected)', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/users?search=test@example.com')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.some(u => u.email === testUser.email)).toBe(true);
  });

  it('/v1/users/:id (GET) - Get specific user (Protected)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body.id).toBe(userId);
    expect(response.body.email).toBe(testUser.email);
  });

  it('/v1/users/:id (PATCH) - Update user (Protected)', async () => {
    const updateData = { email: 'updated@example.com' };
    const response = await request(app.getHttpServer())
      .patch(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.email).toBe(updateData.email);
  });

  it('/v1/users/:id (DELETE) - Soft delete user (Protected)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Verify soft deletion - User should not appear in list
    const listRes = await request(app.getHttpServer())
      .get('/v1/users')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(listRes.body.data.some(u => u.id === userId)).toBe(false);
  });

  it('/v1/users/:id (GET) - Get non-existent user (Protected)', async () => {
    // Create a new user to get a valid token
    const newUser = { email: 'temp@example.com', password: 'password' };
    await request(app.getHttpServer()).post('/v1/users').send(newUser).expect(201);

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(newUser)
      .expect(200);

    const token = loginRes.body.access_token;
    const fakeId = 'nonicon-existent-id';

    await request(app.getHttpServer())
      .get(`/v1/users/${fakeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
