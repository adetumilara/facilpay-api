import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Skip metrics endpoint to avoid recursion
    if (req.path === '/metrics') {
      next();
      return;
    }

    // Normalize route paths to avoid cardinality explosion
    const route = this.normalizeRoute(req.path);

    // Intercept response to record metrics
    const originalSend = res.send;
    res.send = function (data) {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordHttpRequest(req.method, route, res.statusCode, duration);
      return originalSend.call(this, data);
    }.bind({ metricsService: this.metricsService });

    next();
  }

  private normalizeRoute(path: string): string {
    // Replace UUIDs and numeric IDs with placeholders to avoid cardinality explosion
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*/, ''); // Remove query params
  }
}
