import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/**
 * Extends the standard JWT guard to also accept a Bearer token
 * from the `?token=` query parameter — needed because browser
 * EventSource cannot set Authorization headers.
 */
@Injectable()
export class SseJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    return super.canActivate(context);
  }
}
