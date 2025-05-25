import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGuardStore } from './feature-flag-cache.interface';
import {
  FEATURE_FLAG_KEY,
  FEATURE_FLAG_OPTIONS_KEY,
  FEATURE_GUARD_REFLECTOR,
  FEATURE_GUARD_STORE,
  FeatureFlagScope,
} from './feature-flag.constants';
import { FeatureFlagOptions } from './feature-flag.interfaces';

/**
 * Interface representing the request object with feature flag capabilities.
 * This interface extends the standard HTTP request to include feature flag context.
 *
 * @interface FeatureGuardRequest
 * @property {string} [__user_id] - Optional user identifier for feature flag evaluation
 * @property {boolean} [__is_admin] - Optional flag indicating if the user has admin privileges (bypasses all feature flags)
 * @property {Record<string, boolean>} [__feature_flags] - Optional map of feature flags and their evaluated states for the current request
 *
 * @example
 * ```typescript
 * // In your middleware or auth guard
 * req.__user_id = user.id;
 * req.__is_admin = user.isAdmin;
 * req.__feature_flags = {}; // Will be populated by FeatureGuard
 * ```
 */
export interface FeatureGuardRequest {
  __user_id?: string;
  __is_admin?: boolean;
  __feature_flags?: Record<string, boolean>;
}

/**
 * Feature Guard implementation for NestJS that controls access based on feature flags.
 *
 * This guard provides fine-grained access control using feature flags stored in a cache backend.
 * It supports both controller-level access control and service-level feature detection.
 *
 * Key Features:
 * - User-specific feature flag evaluation
 * - Admin user bypass (admins have access to all features)
 * - Automatic feature flag state injection into request objects
 * - Support for different scopes (CONTROLLER vs SERVICE)
 * - Pluggable cache backend via FeatureGuardStore interface
 *
 * @class FeatureGuard
 * @implements {CanActivate}
 *
 * @example
 * ```typescript
 * // Basic usage with @FeatureFlag decorator
 * @Controller('beta')
 * export class BetaController {
 *   @Get('dashboard')
 *   @FeatureFlag('beta_access')
 *   getBetaDashboard() {
 *     return { message: 'Welcome to beta!' };
 *   }
 * }
 * ```
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  /**
   * Creates an instance of FeatureGuard.
   *
   * @param {FeatureGuardStore} store - The feature flag store implementation (Redis, Database, etc.)
   * @param {Reflector} reflector - NestJS reflector for metadata access
   *
   * @example
   * ```typescript
   * // Manual instantiation (usually done via DI)
   * const guard = new FeatureGuard(storeService, reflector);
   * ```
   */
  constructor(
    @Inject(FEATURE_GUARD_STORE) private readonly store: FeatureGuardStore,
    @Inject(FEATURE_GUARD_REFLECTOR) private readonly reflector: Reflector,
  ) {}

  /**
   * Determines if a request can proceed based on feature flag configuration.
   *
   * This method implements the core feature flag evaluation logic:
   * 1. Extracts user context from the request
   * 2. Checks if user is admin (grants full access)
   * 3. Retrieves feature flag metadata from decorator
   * 4. Evaluates feature flag state from store
   * 5. Sets feature flag state on request object
   * 6. Returns access decision based on scope and flag state
   *
   * @param {ExecutionContext} context - The NestJS execution context
   * @returns {Promise<boolean>} True if the request can proceed, false otherwise
   *
   * @throws {Error} If the store implementation fails or throws an error
   *
   * @example
   * ```typescript
   * // This method is called automatically by NestJS when using @FeatureFlag decorator
   * // You typically don't call this directly
   *
   * // For SERVICE scope - always returns true but sets flag state
   * @FeatureFlag('my_feature', { scope: FeatureFlagScope.SERVICE })
   *
   * // For CONTROLLER scope (default) - returns false if feature is disabled
   * @FeatureFlag('my_feature') // scope defaults to CONTROLLER
   * ```
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FeatureGuardRequest>();
    const userId = request.__user_id;
    const isAdmin = request.__is_admin;

    // Deny access if no user identification is provided
    if (userId === undefined && isAdmin !== true) {
      return false;
    }

    // Grant full access to admin users (admin bypass) - must be strictly boolean true
    if (isAdmin === true) {
      return true;
    }

    const flag = this.reflector.get<string>(FEATURE_FLAG_KEY, context.getHandler());
    const options = this.reflector.get<FeatureFlagOptions | undefined>(
      FEATURE_FLAG_OPTIONS_KEY,
      context.getHandler(),
    );

    if (flag === undefined || flag === null) return false;

    const feature = await this.store.getFeature(flag);
    const hasFlag = userId !== undefined ? await this.store.hasFeatureFlag(flag, userId) : false;

    // Always set the feature flag value on the request object for business logic use
    request.__feature_flags = {
      ...request.__feature_flags,
      [flag]: feature?.enabled === true && hasFlag,
    };

    // If not SERVICE scope, also check access (CONTROLLER scope blocks access)
    if (options?.scope !== FeatureFlagScope.SERVICE) {
      if (!feature?.enabled || !hasFlag) {
        return false;
      }
    }

    return true;
  }

  /**
   * Utility method to check if a feature flag is enabled in business logic.
   *
   * This static method provides a convenient way to check feature flag states
   * within your services, controllers, or other business logic components.
   * The feature flag state must have been previously set by the FeatureGuard.
   *
   * @param {FeatureGuardRequest} request - The request object containing feature flags
   * @param {string} flag - The feature flag identifier to check
   * @returns {boolean} True if the feature is enabled for the current request, false otherwise
   *
   * @example
   * ```typescript
   * @Injectable()
   * export class NotificationService {
   *   async sendNotification(request: FeatureGuardRequest, message: string) {
   *     // Check if email notifications are enabled
   *     if (FeatureGuard.isFeatureEnabled(request, 'email_notifications')) {
   *       await this.sendEmailNotification(message);
   *     }
   *
   *     // Check if push notifications are enabled
   *     if (FeatureGuard.isFeatureEnabled(request, 'push_notifications')) {
   *       await this.sendPushNotification(message);
   *     }
   *
   *     // Fallback to basic notification
   *     await this.sendBasicNotification(message);
   *   }
   * }
   *
   * @Controller('products')
   * export class ProductController {
   *   @Get()
   *   @FeatureFlag('enhanced_search', { scope: FeatureFlagScope.SERVICE })
   *   async getProducts(@Req() request: FeatureGuardRequest) {
   *     const products = await this.productService.getProducts();
   *
   *     // Progressive enhancement based on feature flags
   *     if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
   *       return this.productService.getProductsWithEnhancedSearch();
   *     }
   *
   *     return products;
   *   }
   * }
   * ```
   */
  static isFeatureEnabled(request: FeatureGuardRequest, flag: string): boolean {
    return request.__feature_flags?.[flag] === true;
  }
}

/**
 * Decorator for enabling feature flag protection on routes or methods.
 *
 * This decorator applies the FeatureGuard to a method and configures it with
 * the specified feature flag and options. It supports two main scopes:
 *
 * - **CONTROLLER** (default): Blocks access if feature is disabled
 * - **SERVICE**: Always allows access but sets feature flag state for business logic
 *
 * @param {string} flag - The feature flag identifier
 * @param {FeatureFlagOptions} [options] - Optional configuration for the feature flag
 * @param {FeatureFlagScope} [options.scope] - The scope of the feature flag (CONTROLLER or SERVICE)
 * @returns {MethodDecorator} A method decorator that applies the feature guard
 *
 * @example
 * ```typescript
 * // Controller-level access control (default behavior)
 * @Controller('beta')
 * export class BetaController {
 *   @Get('dashboard')
 *   @FeatureFlag('beta_access') // Blocks access if disabled
 *   getBetaDashboard() {
 *     return { message: 'Welcome to beta dashboard!' };
 *   }
 *
 *   @Post('feedback')
 *   @FeatureFlag('beta_access')
 *   @FeatureFlag('feedback_system') // Multiple flags can be applied
 *   submitFeedback(@Body() feedback: any) {
 *     return { message: 'Feedback submitted' };
 *   }
 * }
 *
 * // Service-level feature detection
 * @Controller('products')
 * export class ProductController {
 *   @Get()
 *   @FeatureFlag('enhanced_search', { scope: FeatureFlagScope.SERVICE })
 *   async getProducts(@Req() request: FeatureGuardRequest) {
 *     // Request always proceeds, but flag state is available
 *     const products = await this.productService.getProducts();
 *
 *     if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
 *       // Add enhanced search capabilities
 *       return this.productService.getProductsWithEnhancedSearch();
 *     }
 *
 *     return products;
 *   }
 * }
 *
 * // Advanced usage with multiple feature flags
 * @Controller('analytics')
 * export class AnalyticsController {
 *   @Get('dashboard')
 *   @FeatureFlag('analytics_access') // Must have basic access
 *   async getDashboard(@Req() request: FeatureGuardRequest) {
 *     const data = await this.getBasicAnalytics();
 *
 *     // Progressive enhancement based on additional flags
 *     if (FeatureGuard.isFeatureEnabled(request, 'advanced_charts')) {
 *       data.charts = await this.getAdvancedCharts();
 *     }
 *
 *     if (FeatureGuard.isFeatureEnabled(request, 'real_time_data')) {
 *       data.realTime = await this.getRealTimeData();
 *     }
 *
 *     return data;
 *   }
 * }
 * ```
 */
export function FeatureFlag(flag: string, options?: FeatureFlagOptions): MethodDecorator {
  return applyDecorators(
    SetMetadata(FEATURE_FLAG_KEY, flag),
    SetMetadata(FEATURE_FLAG_OPTIONS_KEY, options),
    UseGuards(FeatureGuard),
  );
}
