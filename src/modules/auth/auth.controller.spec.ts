// otplib uses ESM dependencies that Jest cannot transform — mock it entirely
jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
    keyuri: jest.fn().mockReturnValue('otpauth://totp/mock'),
    verify: jest.fn().mockReturnValue(false),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import {
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { RegisterDto } from '../users/dto/register.dto';
import { LoginDto } from '../users/dto/login.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { WebAuthnService } from './webauthn.service';
import { LoginAlertsService } from './login-alerts.service';
import type { Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    completePasskeyLogin: jest.fn(),
    enableTwoFactor: jest.fn(),
    verifyTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
    createRole: jest.fn(),
    assignRole: jest.fn(),
  };

  const mockUsersService = {
    unlockAccount: jest.fn(),
  };

  const mockWebAuthnService = {
    registrationOptions: jest.fn(),
    verifyRegistration: jest.fn(),
    authenticationOptions: jest.fn(),
    verifyAuthentication: jest.fn(),
    listCredentials: jest.fn(),
    renameCredential: jest.fn(),
    deleteCredential: jest.fn(),
  };
  const mockLoginAlertsService = {
    reportNotMe: jest.fn(),
    setPreference: jest.fn(),
  };

  const mockRoleRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: WebAuthnService,
          useValue: mockWebAuthnService,
        },
        {
          provide: LoginAlertsService,
          useValue: mockLoginAlertsService,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        message: 'User registered successfully',
        user: {
          id: '1',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('login', () => {
    it('should login a user and return access token', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        access_token: 'jwt-token',
        user: {
          id: '1',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const req = { ip: '127.0.0.1', headers: {} } as any;
      const response = { status: jest.fn() } as any;
      const result = await controller.login(loginDto, req, response);

      expect(authService.login).toHaveBeenCalledWith(loginDto, req.ip, undefined);
      expect(response.status).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should return 202 when two-factor code is required', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const req = { ip: '127.0.0.1', headers: {} } as any;
      const response = { status: jest.fn() } as any;
      const expectedResult = {
        '2fa_required': true,
        message: 'Two-factor authentication code required',
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto, req, response);

      expect(response.status).toHaveBeenCalledWith(202);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('verifyWebAuthnAuthentication', () => {
    it('verifies the assertion and completes a normal login session', async () => {
      const dto = {
        twoFactorToken: 'password-verified-token',
        challengeToken: 'one-use-challenge-token',
        response: { id: 'credential-id' },
      } as any;
      const request = {
        ip: '203.0.113.4',
        headers: { 'user-agent': 'test-browser' },
      } as any;
      const loginResult = { access_token: 'access', refresh_token: 'refresh' };
      mockWebAuthnService.verifyAuthentication.mockResolvedValue({
        userId: 'user-1',
        deviceId: 'device-1',
      });
      mockAuthService.completePasskeyLogin.mockResolvedValue(loginResult);

      const result = await controller.verifyWebAuthnAuthentication(dto, request);

      expect(mockWebAuthnService.verifyAuthentication).toHaveBeenCalledWith(
        dto.twoFactorToken,
        dto.challengeToken,
        dto.response,
      );
      expect(mockAuthService.completePasskeyLogin).toHaveBeenCalledWith(
        'user-1',
        request.ip,
        'test-browser',
        'device-1',
      );
      expect(result).toEqual(loginResult);
    });
  });

  describe('confirmUnrecognizedLogin', () => {
    it('renders a confirmation form instead of revoking sessions on GET', async () => {
      const responseMock = {
        status: jest.fn(),
        type: jest.fn(),
        send: jest.fn(),
      };
      responseMock.status.mockReturnValue(responseMock);
      responseMock.type.mockReturnValue(responseMock);

      await controller.confirmUnrecognizedLogin(
        'single-use-token',
        responseMock as unknown as Response,
      );

      expect(responseMock.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(responseMock.type).toHaveBeenCalledWith('html');
      expect(responseMock.send).toHaveBeenCalledWith(
        expect.stringContaining('method="post"'),
      );
      expect(mockLoginAlertsService.reportNotMe).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // disableTwoFactor — throttle & delegation tests  (Issue #322)
  // ──────────────────────────────────────────────────────────────────────────
  describe('disableTwoFactor', () => {
    it('should call authService.disableTwoFactor with the current user and dto', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'CorrectP@ss1' };
      const expectedResult = {
        message: 'Two-factor authentication disabled',
        twoFactorEnabled: false,
      };

      mockAuthService.disableTwoFactor.mockResolvedValue(expectedResult);

      const result = await controller.disableTwoFactor(mockUser, dto);

      expect(authService.disableTwoFactor).toHaveBeenCalledWith(
        mockUser.id,
        dto,
        undefined,
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should have @AuthThrottle metadata — confirming rate limiting is applied to this endpoint', () => {
      // @AuthThrottle() applies Throttle({ auth: 5 }) which stores THROTTLER:TTLauth and
      // THROTTLER:LIMITauth metadata keys on the method descriptor.
      // Presence of these keys proves the decorator was applied correctly.
      const metaKeys: string[] = Reflect.getMetadataKeys(
        AuthController.prototype.disableTwoFactor,
      );

      expect(metaKeys).toContain('THROTTLER:TTLauth');
      expect(metaKeys).toContain('THROTTLER:LIMITauth');
    });

    it('should propagate UnauthorizedException (wrong password) thrown by authService', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'wrong' };

      mockAuthService.disableTwoFactor.mockRejectedValue(
        new UnauthorizedException('Invalid password'),
      );

      await expect(
        controller.disableTwoFactor(mockUser, dto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate 423 Locked error thrown by authService when account is locked', async () => {
      const { HttpException } = require('@nestjs/common');
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'any' };

      const lockedError = new HttpException(
        { statusCode: 423, message: 'Account is locked. Please try again in 900 seconds.', error: 'Locked' },
        HttpStatus.LOCKED ?? 423,
      );
      mockAuthService.disableTwoFactor.mockRejectedValue(lockedError);

      await expect(
        controller.disableTwoFactor(mockUser, dto),
      ).rejects.toThrow(HttpException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // verifyTwoFactor — throttle & delegation tests (Issue #320)
  // ──────────────────────────────────────────────────────────────────────────
  describe('verifyTwoFactor', () => {
    it('should have @AuthThrottle metadata — confirming rate limiting is applied to this endpoint', () => {
      const metaKeys: string[] = Reflect.getMetadataKeys(
        AuthController.prototype.verifyTwoFactor,
      );
      expect(metaKeys).toContain('THROTTLER:TTLauth');
      expect(metaKeys).toContain('THROTTLER:LIMITauth');
    });

    it('should call authService.verifyTwoFactor with the current user and dto', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { code: '123456' } as any;
      const expectedResult = {
        message: 'Two-factor authentication enabled',
        twoFactorEnabled: true,
      };
      mockAuthService.verifyTwoFactor.mockResolvedValue(expectedResult);

      const result = await controller.verifyTwoFactor(mockUser, dto, {} as any);

      expect(authService.verifyTwoFactor).toHaveBeenCalledWith(
        mockUser.id,
        dto,
        undefined,
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should propagate UnauthorizedException for invalid code', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { code: '000000' } as any;
      mockAuthService.verifyTwoFactor.mockRejectedValue(
        new UnauthorizedException('Invalid two-factor code'),
      );
      await expect(controller.verifyTwoFactor(mockUser, dto, {} as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
