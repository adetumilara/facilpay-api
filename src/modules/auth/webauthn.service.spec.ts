jest.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: jest.fn(),
  generateRegistrationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { WebAuthnChallenge } from './entities/webauthn-challenge.entity';
import { WebAuthnCredential } from './entities/webauthn-credential.entity';
import { WebAuthnService } from './webauthn.service';

interface UpdateBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
}

interface RepositoryMock {
  [method: string]: jest.Mock;
}

function createUpdateBuilder(affected = 1): UpdateBuilderMock {
  const builder: UpdateBuilderMock = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  return builder;
}

describe('WebAuthnService', () => {
  let service: WebAuthnService;
  let credentialRepository: RepositoryMock;
  let challengeRepository: RepositoryMock;
  let userRepository: RepositoryMock;
  let jwtService: RepositoryMock;
  let configService: RepositoryMock;
  let challengeUpdate: ReturnType<typeof createUpdateBuilder>;
  let credentialUpdate: ReturnType<typeof createUpdateBuilder>;

  beforeEach(() => {
    jest.clearAllMocks();
    challengeUpdate = createUpdateBuilder();
    credentialUpdate = createUpdateBuilder();
    credentialRepository = {
      countBy: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: Partial<WebAuthnCredential>) => data),
      save: jest.fn((data: Partial<WebAuthnCredential>) =>
        Promise.resolve({ id: 'credential-row', ...data }),
      ),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(credentialUpdate),
    };
    challengeRepository = {
      create: jest.fn((data: Partial<WebAuthnChallenge>) => data),
      save: jest.fn((data: Partial<WebAuthnChallenge>) =>
        Promise.resolve({ id: 'challenge-row', ...data }),
      ),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(challengeUpdate),
    };
    userRepository = { findOne: jest.fn() };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-challenge'),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'APP_URL') return 'https://pay.example.test';
        return fallback;
      }),
    };

    service = new WebAuthnService(
      credentialRepository as unknown as Repository<WebAuthnCredential>,
      challengeRepository as unknown as Repository<WebAuthnChallenge>,
      userRepository as unknown as Repository<User>,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('creates registration options and stores their challenge', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.test',
      name: 'Example Owner',
    });
    credentialRepository.find.mockResolvedValue([]);
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({
      challenge: 'registration-challenge',
      rp: { id: 'pay.example.test', name: 'FacilPay' },
    });

    const result = await service.registrationOptions('user-1');

    expect(result).toMatchObject({
      options: { challenge: 'registration-challenge' },
      challengeToken: 'signed-challenge',
    });
    expect(challengeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        purpose: 'registration',
        challenge: 'registration-challenge',
      }),
    );
  });

  it('stores a verified registration credential without exposing its public key', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      challengeId: 'challenge-1',
      purpose: 'webauthn-registration',
    });
    challengeRepository.findOne.mockResolvedValue({
      id: 'challenge-1',
      userId: 'user-1',
      purpose: 'registration',
      challenge: 'registration-challenge',
    });
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'credential-id',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
      },
    });

    const result = await service.verifyRegistration(
      'user-1',
      'registration-token',
      {
        id: 'credential-id',
        rawId: 'credential-id',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: ['internal'],
        },
      } as unknown as RegistrationResponseJSON,
      'Laptop',
    );

    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'registration-challenge',
        expectedOrigin: 'https://pay.example.test',
        expectedRPID: 'pay.example.test',
        requireUserVerification: true,
      }),
    );
    expect(challengeUpdate.set).toHaveBeenCalledTimes(1);
    expect(credentialRepository.save).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('publicKey');
  });

  it('accepts a valid assertion and advances the stored signature counter', async () => {
    jwtService.verifyAsync
      .mockResolvedValueOnce({ sub: 'user-1', purpose: 'two-factor-login' })
      .mockResolvedValueOnce({
        sub: 'user-1',
        challengeId: 'challenge-1',
        purpose: 'webauthn-authentication',
      });
    challengeRepository.findOne.mockResolvedValue({
      id: 'challenge-1',
      userId: 'user-1',
      purpose: 'authentication',
      challenge: 'assertion-challenge',
    });
    credentialRepository.findOne.mockResolvedValue({
      id: 'credential-row',
      userId: 'user-1',
      credentialId: 'credential-id',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 4,
      transports: ['internal'],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    const result = await service.verifyAuthentication(
      'two-factor-token',
      'challenge-token',
      {
        id: 'credential-id',
        rawId: 'credential-id',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: '',
          authenticatorData: '',
          signature: '',
        },
      },
    );

    expect(result).toEqual({ userId: 'user-1', deviceId: undefined });
    expect(verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
    expect(credentialUpdate.set).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-advancing signature counter', async () => {
    jwtService.verifyAsync
      .mockResolvedValueOnce({ sub: 'user-1', purpose: 'two-factor-login' })
      .mockResolvedValueOnce({
        sub: 'user-1',
        challengeId: 'challenge-1',
        purpose: 'webauthn-authentication',
      });
    challengeRepository.findOne.mockResolvedValue({
      id: 'challenge-1',
      userId: 'user-1',
      purpose: 'authentication',
      challenge: 'assertion-challenge',
    });
    credentialRepository.findOne.mockResolvedValue({
      id: 'credential-row',
      userId: 'user-1',
      credentialId: 'credential-id',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 5,
      transports: [],
    });
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    await expect(
      service.verifyAuthentication('two-factor-token', 'challenge-token', {
        id: 'credential-id',
        rawId: 'credential-id',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: '',
          authenticatorData: '',
          signature: '',
        },
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(challengeUpdate.execute).not.toHaveBeenCalled();
    expect(credentialUpdate.execute).not.toHaveBeenCalled();
  });
});
