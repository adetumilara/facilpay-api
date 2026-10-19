import { SetMetadata } from '@nestjs/common';

export const REQUIRE_SCOPE_KEY = 'require_scope';

/**
 * Decorator to specify required API key scopes for a route
 * Usage: @RequireScope('payments:read', 'payment-links:write')
 */
export const RequireScope = (...scopes: string[]) =>
  SetMetadata(REQUIRE_SCOPE_KEY, scopes);
