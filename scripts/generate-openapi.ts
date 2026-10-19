import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

async function generateOpenApi() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('FacilPay API')
    .setDescription(
      'FacilPay payment processing API.\n\n' +
      '## Authentication\n' +
      '- **JWT Bearer**: Obtain a token via `POST /v1/auth/login` and pass it as `Authorization: Bearer <token>`.\n' +
      '- **API Key**: Pass your API key as the `X-API-Key` header for server-to-server requests.\n\n' +
      '## Idempotency\n' +
      'Payment creation supports idempotency via the `Idempotency-Key` request header. ' +
      'Keys are valid for 24 hours. Reusing a key with a different payload returns 409 Conflict.',
    )
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local development')
    .addServer('https://api.facilpay.com', 'Production')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token obtained from POST /v1/auth/login',
      },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for server-to-server requests',
      },
      'api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Ensure dist directory exists
  mkdirSync(resolve(__dirname, '../dist'), { recursive: true });

  // Write OpenAPI spec
  const specPath = resolve(__dirname, '../dist/openapi.json');
  writeFileSync(specPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI spec generated at ${specPath}`);

  await app.close();
}

generateOpenApi().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
