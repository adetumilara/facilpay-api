import { Controller, Get, HttpException, HttpStatus, Req } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getMetrics(@Req() req: Request): string {
    this.validateMetricsAccess(req);
    return this.metricsService.getMetrics();
  }

  private validateMetricsAccess(req: Request) {
    const metricsToken = this.configService.get<string>('METRICS_TOKEN');

    // If no token is configured, deny access
    if (!metricsToken) {
      throw new HttpException(
        'Metrics endpoint not configured',
        HttpStatus.NOT_FOUND,
      );
    }

    // Check bearer token
    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);

    if (tokenMatch && tokenMatch[1] === metricsToken) {
      return; // Access granted
    }

    // Check IP allowlist if configured
    const allowedIps = this.configService.get<string>('METRICS_ALLOWED_IPS');
    if (allowedIps) {
      const clientIp = this.getClientIp(req);
      const ipList = allowedIps.split(',').map((ip) => ip.trim());
      if (ipList.includes(clientIp)) {
        return; // Access granted
      }
    }

    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }

  private getClientIp(req: Request): string {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '0.0.0.0';
  }
}
