/**
 * Options for setting a feature flag in the store.
 *
 * This interface defines the structure for configuring feature flags with different access patterns:
 * - Global access (enabled=true, no userIds specified)
 * - Targeted access (enabled=true with userIds)
 * - Disabled (enabled=false - disabled for everyone regardless of userIds)
 *
 * @interface SetFeatureFlagOptions
 * @property {string} flag - The unique identifier for the feature flag
 * @property {boolean} enabled - Whether the feature is enabled or disabled
 * @property {string[]} [userIds] - Optional array of user IDs for targeted access control (only used when enabled=true)
 *
 * @example
 * ```typescript
 * // Global access - everyone has access
 * const globalAccess: SetFeatureFlagOptions = {
 *   flag: 'global_feature',
 *   enabled: true
 *   // No userIds = global access
 * };
 *
 * // Targeted access - only specific users have access
 * const targetedAccess: SetFeatureFlagOptions = {
 *   flag: 'beta_feature',
 *   enabled: true,
 *   userIds: ['user1', 'user2', 'user3']
 * };
 *
 * // Disabled feature - no one has access (userIds ignored)
 * const disabled: SetFeatureFlagOptions = {
 *   flag: 'disabled_feature',
 *   enabled: false
 *   // userIds are ignored when enabled=false
 * };
 * ```
 */
export interface SetFeatureFlagOptions {
  flag: string;
  enabled: boolean;
  userIds?: string[];
}

/**
 * Interface for implementing feature flag store backends.
 *
 * This interface defines the contract that all feature flag store implementations must follow.
 * It provides methods for setting, retrieving, and checking feature flags with support for
 * user-specific access control.
 *
 * The store implementation handles the storage and retrieval of feature flag data, including:
 * - Feature flag metadata (enabled state)
 * - User access lists for targeted rollouts
 * - Efficient lookup operations for real-time access control
 *
 * @interface FeatureGuardStore
 *
 * @example
 * ```typescript
 * // Example Redis implementation
 * @Injectable()
 * export class RedisFeatureFlagCache implements FeatureGuardStore {
 *   constructor(private readonly redis: Redis) {}
 *
 *   async setFeatureFlag(options: SetFeatureFlagOptions): Promise<void> {
 *     // Implementation details...
 *   }
 *
 *   async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
 *     // Implementation details...
 *   }
 *
 *   async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
 *     // Implementation details...
 *   }
 * }
 *
 * // Example database implementation
 * @Injectable()
 * export class DatabaseFeatureFlagCache implements FeatureGuardStore {
 *   constructor(
 *     @InjectRepository(FeatureFlag)
 *     private readonly featureFlagRepo: Repository<FeatureFlag>
 *   ) {}
 *
 *   async setFeatureFlag(options: SetFeatureFlagOptions): Promise<void> {
 *     // Database implementation...
 *   }
 *
 *   async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
 *     // Database implementation...
 *   }
 *
 *   async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
 *     // Database implementation...
 *   }
 * }
 * ```
 */
export interface FeatureGuardStore {
  /**
   * Sets or updates a feature flag in the store.
   *
   * This method stores feature flag configuration including the enabled state and optional user access list.
   * The behavior depends on the combination of `enabled` and `userIds`:
   *
   * | enabled | userIds | Behavior |
   * |---------|---------|----------|
   * | true | undefined/empty | Global access - everyone has access |
   * | true | ['user1', 'user2'] | Targeted access - only listed users have access |
   * | false | undefined/empty | Global deny - no one has access |
   * | false | ['user1', 'user2'] | Global deny - no one has access (userIds ignored) |
   *
   * @param {SetFeatureFlagOptions} options - The feature flag configuration
   * @returns {Promise<void>} Promise that resolves when the flag is successfully stored
   *
   * @throws {Error} If the store operation fails
   *
   * @example
   * ```typescript
   * // Enable feature for specific users (targeted access)
   * await store.setFeatureFlag({
   *   flag: 'beta_dashboard',
   *   enabled: true,
   *   userIds: ['user123', 'user456']
   * });
   *
   * // Enable feature globally
   * await store.setFeatureFlag({
   *   flag: 'new_ui',
   *   enabled: true
   * });
   *
   * // Disable feature globally (userIds ignored)
   * await store.setFeatureFlag({
   *   flag: 'experimental_feature',
   *   enabled: false
   * });
   * ```
   */
  setFeatureFlag(options: SetFeatureFlagOptions): Promise<void>;

  /**
   * Retrieves feature flag metadata from the store.
   *
   * This method returns the complete feature flag configuration including the enabled state
   * and the list of users with specific access (if any). Returns null if the feature flag
   * doesn't exist in the store.
   *
   * @param {string} flag - The feature flag identifier
   * @returns {Promise<{ enabled: boolean; userIds?: string[] } | null>} Feature flag metadata or null if not found
   *
   * @example
   * ```typescript
   * // Get feature flag metadata
   * const feature = await store.getFeature('beta_dashboard');
   *
   * if (feature) {
   *   console.log(`Feature enabled: ${feature.enabled}`);
   *   console.log(`User list: ${feature.userIds || 'Global access'}`);
   * } else {
   *   console.log('Feature flag not found');
   * }
   *
   * // Example return values:
   * // { enabled: true, userIds: ['user1', 'user2'] } - Targeted access
   * // { enabled: true } - Global access
   * // { enabled: false, userIds: ['user1'] } - Disabled (userIds ignored)
   * // null - Feature doesn't exist
   * ```
   */
  getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null>;

  /**
   * Checks if a specific user has access to a feature flag.
   *
   * This method implements the core access control logic by evaluating the feature flag
   * configuration against the provided user ID. The logic follows these rules:
   *
   * 1. If feature doesn't exist: return false
   * 2. If feature is disabled: return false (disabled means disabled for everyone)
   * 3. If feature is enabled and no user list exists (global feature): return true
   * 4. If feature is enabled and user list exists: return true only if user is in the list
   *
   * @param {string} flag - The feature flag identifier
   * @param {string} userId - The user identifier to check
   * @returns {Promise<boolean>} True if the user has access to the feature, false otherwise
   *
   * @example
   * ```typescript
   * // Check if user has access to a feature
   * const hasAccess = await store.hasFeatureFlag('beta_dashboard', 'user123');
   *
   * if (hasAccess) {
   *   console.log('User has access to beta dashboard');
   * } else {
   *   console.log('User does not have access');
   * }
   *
   * // Example scenarios:
   * // Feature: { enabled: true, userIds: ['user123'] }
   * // hasFeatureFlag('beta', 'user123') -> true (user in targeted list)
   * // hasFeatureFlag('beta', 'user456') -> false (user not in targeted list)
   *
   * // Feature: { enabled: false, userIds: ['user123'] }
   * // hasFeatureFlag('disabled', 'user123') -> false (feature disabled)
   * // hasFeatureFlag('disabled', 'user456') -> false (feature disabled)
   *
   * // Feature: { enabled: true } (no userIds)
   * // hasFeatureFlag('global', 'anyone') -> true (global access)
   * ```
   */
  hasFeatureFlag(flag: string, userId: string): Promise<boolean>;
}
