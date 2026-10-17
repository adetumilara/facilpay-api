import { HttpAdapterHost } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { LoggingExceptionFilter } from './logging-exception.filter';
import { AppLogger } from './logger.service';
import { Request, Response } from 'express';

describe('LoggingExceptionFilter', () => {
  let mockPinoLogger: any;
  let mockAppLogger: any;
  let httpAdapterHost: any;
  let filter: LoggingExceptionFilter;

  beforeEach(() => {
    mockPinoLogger = {
      error: jest.fn(),
    };
    mockAppLogger = {
      child: jest.fn(() => mockPinoLogger),
    } as unknown as AppLogger;

    httpAdapterHost = {
      httpAdapter: {
        reply: jest.fn(),
      },
    } as unknown as HttpAdapterHost;

    filter = new LoggingExceptionFilter(mockAppLogger, httpAdapterHost);
  });

  it('logs errors with stack traces', () => {
    const error = new Error('boom');
    const request = {
      method: 'GET',
      originalUrl: '/test',
      requestId: 'req-123',
      user: { id: 'user-1' },
    } as any;
    const response = { locals: {} } as any;

    (filter as any).logException(error, request, response, 500);

    expect(mockPinoLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      'Unhandled exception',
    );
    const meta = mockPinoLogger.error.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect((meta.err as Error).stack).toBeDefined();
  });

  describe('QueryFailedError handling', () => {
    it('should handle duplicate key error safely', () => {
      const mockRequest = {
        url: '/api/data',
        originalUrl: '/api/data',
        method: 'POST',
      } as Request;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: {},
      } as unknown as Response;

      const mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      } as any;

      const queryError = new QueryFailedError(
        'SELECT * FROM users WHERE email = ?',
        ['test@email.com'],
        new Error('Duplicate key value violates unique constraint'),
      );

      filter.catch(queryError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe('QueryFailedError');
      expect(jsonCall.message).toBe('A resource with this value already exists');
      expect(jsonCall.statusCode).toBe(HttpStatus.BAD_REQUEST);
      // Ensure raw SQL is NOT exposed
      expect(jsonCall.message).not.toContain('SELECT');
    });

    it('should handle constraint error safely', () => {
      const mockRequest = {
        url: '/api/data',
        originalUrl: '/api/data',
        method: 'PUT',
      } as Request;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: {},
      } as unknown as Response;

      const mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      } as any;

      const queryError = new QueryFailedError(
        'UPDATE users SET email = ? WHERE id = ?',
        ['newemail@email.com', '1'],
        new Error('Foreign key constraint failed'),
      );

      filter.catch(queryError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.message).toBe('Invalid data provided');
      // Ensure raw SQL is NOT exposed
      expect(jsonCall.message).not.toContain('UPDATE');
    });

    it('should not expose raw SQL queries in error messages', () => {
      const mockRequest = {
        url: '/api/data',
        originalUrl: '/api/data',
        method: 'DELETE',
      } as Request;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: {},
      } as unknown as Response;

      const mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      } as any;

      const queryError = new QueryFailedError(
        'DELETE FROM users WHERE id = ? AND age > ?',
        ['5', '18'],
        new Error('Syntax error in query'),
      );

      filter.catch(queryError, mockArgumentsHost);

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.message).not.toContain('DELETE');
      expect(jsonCall.message).not.toContain('query');
    });
  });
});
