/**
 * Metadata key for storing feature flag identifiers in NestJS decorators.
 * Used internally by the @FeatureFlag decorator to store the flag name.
 *
 * @constant {string}
 */
export const FEATURE_FLAG_KEY = 'feature-flag';

/**
 * Metadata key for storing feature flag options in NestJS decorators.
 * Used internally by the @FeatureFlag decorator to store configuration options.
 *
 * @constant {string}
 */
export const FEATURE_FLAG_OPTIONS_KEY = 'feature-flag-options';

/**
 * Dependency injection token for the feature flag store.
 * Use this token when injecting the FeatureGuardStore implementation.
 *
 * @constant {string}
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     @Inject(FEATURE_GUARD_STORE)
 *     private readonly store: FeatureGuardStore,
 *   ) {}
 * }
 * ```
 */
export const FEATURE_GUARD_STORE = 'FeatureGuardStore';

/**
 * Dependency injection token for the NestJS Reflector.
 * Used internally by the FeatureGuard to access decorator metadata.
 *
 * @constant {string}
 */
export const FEATURE_GUARD_REFLECTOR = 'FeatureGuardReflector';

/**
 * Enumeration defining the different scopes for feature flag evaluation.
 *
 * The scope determines how the FeatureGuard behaves when a feature flag is disabled:
 * - **CONTROLLER**: Blocks access to the route/method (returns 403 Forbidden)
 * - **SERVICE**: Allows access but sets the flag state for business logic use
 *
 * @enum {string}
 *
 * @example
 * ```typescript
 * // Controller scope (default) - blocks access if feature is disabled
 * @Get('beta-feature')
 * @FeatureFlag('beta_access') // scope defaults to CONTROLLER
 * getBetaFeature() {
 *   return { message: 'Beta feature content' };
 * }
 *
 * // Service scope - always allows access, flag state available for logic
 * @Get('products')
 * @FeatureFlag('enhanced_search', { scope: FeatureFlagScope.SERVICE })
 * getProducts(@Req() request: FeatureGuardRequest) {
 *   const products = await this.productService.getProducts();
 *
 *   // Check flag state in business logic
 *   if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
 *     return this.productService.getProductsWithEnhancedSearch();
 *   }
 *
 *   return products;
 * }
 * ```
 */
export enum FeatureFlagScope {
  /**
   * Controller scope - blocks access to the route/method if feature is disabled.
   * This is the default scope when no scope is specified in the @FeatureFlag decorator.
   *
   * When a feature flag with CONTROLLER scope is disabled or the user doesn't have access:
   * - The guard returns `false`
   * - NestJS blocks the request and returns a 403 Forbidden response
   * - The route handler method is never executed
   *
   * Use this scope for:
   * - Completely hiding features from users
   * - Beta/experimental endpoints
   * - Premium features that require specific access
   */
  CONTROLLER = 'CONTROLLER',

  /**
   * Service scope - allows access but provides flag state for business logic.
   *
   * When a feature flag with SERVICE scope is used:
   * - The guard always returns `true` (request proceeds)
   * - The flag state is set on the request object
   * - Business logic can check the flag state using FeatureGuard.isFeatureEnabled()
   *
   * Use this scope for:
   * - Progressive enhancement of existing features
   * - A/B testing scenarios
   * - Conditional feature behavior within the same endpoint
   * - Gradual feature rollouts with fallback behavior
   */
  SERVICE = 'SERVICE',
}
