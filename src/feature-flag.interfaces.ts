import { FeatureFlagScope } from './feature-flag.constants';

/**
 * Configuration options for feature flag decorators.
 *
 * This interface defines the optional configuration that can be passed to the @FeatureFlag decorator
 * to customize its behavior. Currently supports scope configuration to determine how the guard
 * behaves when a feature flag is disabled.
 *
 * @interface FeatureFlagOptions
 * @property {FeatureFlagScope} [scope] - The scope determining guard behavior (CONTROLLER or SERVICE)
 *
 * @example
 * ```typescript
 * // Default behavior (CONTROLLER scope) - blocks access if disabled
 * @FeatureFlag('beta_feature')
 *
 * // Explicit CONTROLLER scope - same as default
 * @FeatureFlag('beta_feature', { scope: FeatureFlagScope.CONTROLLER })
 *
 * // SERVICE scope - allows access but sets flag state for business logic
 * @FeatureFlag('enhanced_ui', { scope: FeatureFlagScope.SERVICE })
 * getProducts(@Req() request: FeatureGuardRequest) {
 *   // Request always proceeds, check flag in business logic
 *   if (FeatureGuard.isFeatureEnabled(request, 'enhanced_ui')) {
 *     return this.getEnhancedProducts();
 *   }
 *   return this.getBasicProducts();
 * }
 * ```
 */
export interface FeatureFlagOptions {
  scope?: FeatureFlagScope;
}
