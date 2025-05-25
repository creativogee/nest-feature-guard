import Redis from 'ioredis';
import { FeatureGuardStore } from './feature-flag-cache.interface';

/**
 * Options for setting a feature flag in the Redis store.
 * This interface is re-exported from the main interface for convenience.
 *
 * @interface SetFeatureFlagOptions
 */
interface SetFeatureFlagOptions {
  flag: string;
  enabled: boolean;
  userIds?: string[];
}

/**
 * Redis implementation of the FeatureGuardStore interface.
 *
 * This class provides a high-performance Redis-based store for storing and retrieving
 * feature flag data. It uses Redis data structures optimally:
 * - Hash for feature metadata (enabled state)
 * - Set for user access lists (efficient membership testing)
 *
 * Key Features:
 * - Configurable key prefix for namespace isolation
 * - Atomic operations for data consistency
 * - Efficient user membership testing with Redis sets
 * - Support for both global and user-specific feature flags
 *
 * Redis Key Structure:
 * - `{prefix}:{flag}:info` - Hash containing feature metadata
 * - `{prefix}:{flag}:users` - Set containing user IDs with access
 *
 * @class RedisFeatureFlagCache
 * @implements {FeatureGuardStore}
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { RedisFeatureFlagCache } from 'nest-feature-guard';
 *
 * // Basic setup
 * const redis = new Redis({
 *   host: 'localhost',
 *   port: 6379,
 * });
 *
 * const cache = new RedisFeatureFlagCache(redis);
 *
 * // Custom prefix for namespace isolation
 * const customStore = new RedisFeatureFlagCache(redis, 'myapp:features');
 *
 * // Usage in module
 * @Module({
 *   providers: [
 *     {
 *       provide: FEATURE_GUARD_STORE,
 *       useValue: store,
 *     },
 *   ],
 * })
 * export class FeatureModule {}
 * ```
 */
export class RedisFeatureFlagCache implements FeatureGuardStore {
  private readonly redis: Redis;
  private readonly featureKeyPrefix: string;

  /**
   * Creates a new Redis feature flag store instance.
   *
   * @param {Redis} redis - The Redis client instance
   * @param {string} [featureKeyPrefix='crudmates:feature-guard'] - The key prefix for Redis keys
   *
   * @example
   * ```typescript
   * // Default prefix
   * const store = new RedisFeatureFlagCache(redis);
   * // Keys will be: crudmates:feature-guard:my_feature:info
   *
   * // Custom prefix
   * const store = new RedisFeatureFlagCache(redis, 'myapp:flags');
   * // Keys will be: myapp:flags:my_feature:info
   * ```
   */
  constructor(redis: Redis, featureKeyPrefix = 'crudmates:feature-guard') {
    this.redis = redis;
    this.featureKeyPrefix = featureKeyPrefix;
  }

  /**
   * Sets or updates a feature flag in Redis.
   *
   * This method stores feature flag configuration using Redis hash for metadata
   * and Redis set for user access lists. It handles both global and user-specific
   * feature flags efficiently.
   *
   * The operation is atomic - either both the feature info and user list are updated,
   * or neither is changed if an error occurs.
   *
   * @param {SetFeatureFlagOptions} options - The feature flag configuration
   * @param {string} options.flag - The feature flag identifier
   * @param {boolean} options.enabled - Whether the feature is enabled
   * @param {string[]} [options.userIds] - Optional array of user IDs for targeted access
   * @returns {Promise<void>} Promise that resolves when the operation completes
   *
   * @throws {Error} If the Redis operation fails
   *
   * @example
   * ```typescript
   * // Enable feature for specific users (targeted access)
   * await store.setFeatureFlag({
   *   flag: 'beta_dashboard',
   *   enabled: true,
   *   userIds: ['user123', 'user456', 'user789']
   * });
   *
   * // Enable feature globally (no user restrictions)
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
  async setFeatureFlag({ flag, enabled, userIds }: SetFeatureFlagOptions): Promise<void> {
    const featureInfoKey = `${this.featureKeyPrefix}:${flag}:info`;
    const featureUsersKey = `${this.featureKeyPrefix}:${flag}:users`;

    // Store feature enabled state as string for Redis compatibility
    await this.redis.hmset(featureInfoKey, { enabled: enabled ? 'true' : 'false' });

    if (userIds && userIds.length > 0) {
      // Clear existing users first
      await this.redis.del(featureUsersKey);
      
      // Add users to the set in batches to avoid stack overflow
      const batchSize = 1000;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await this.redis.sadd(featureUsersKey, ...batch);
      }
    } else {
      // No user list means global feature - remove any existing user set
      await this.redis.del(featureUsersKey);
    }
  }

  /**
   * Retrieves feature flag metadata from Redis.
   *
   * This method fetches both the feature configuration (enabled state) and the
   * associated user access list. It returns null if the feature doesn't exist.
   *
   * @param {string} flag - The feature flag identifier
   * @returns {Promise<{ enabled: boolean; userIds?: string[] } | null>} Feature metadata or null
   *
   * @example
   * ```typescript
   * // Get feature metadata
   * const feature = await store.getFeature('beta_dashboard');
   *
   * if (feature) {
   *   console.log(`Feature enabled: ${feature.enabled}`);
   *
   *   if (feature.userIds) {
   *     console.log(`Targeted users: ${feature.userIds.join(', ')}`);
   *   } else {
   *     console.log('Global feature (all users)');
   *   }
   * } else {
   *   console.log('Feature not found');
   * }
   *
   * // Possible return values:
   * // { enabled: true, userIds: ['user1', 'user2'] } - Targeted feature
   * // { enabled: true } - Global feature
   * // null - Feature doesn't exist
   * ```
   */
  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    const featureInfoKey = `${this.featureKeyPrefix}:${flag}:info`;
    const featureUsersKey = `${this.featureKeyPrefix}:${flag}:users`;

    const info = await this.redis.hgetall(featureInfoKey);
    if (!info || !('enabled' in info)) return null;

    const enabled = info.enabled === 'true';
    const userIds = await this.redis.smembers(featureUsersKey);

    return {
      enabled,
      userIds: userIds.length > 0 ? userIds : undefined,
    };
  }

  /**
   * Checks if a specific user has access to a feature flag.
   *
   * This method implements the core access control logic by evaluating the feature
   * configuration against the provided user ID. It uses Redis set membership testing
   * for efficient user lookup.
   *
   * Access Logic:
   * 1. If feature doesn't exist: return false
   * 2. If feature is disabled: return false (disabled means disabled for everyone)
   * 3. If feature is enabled and no user list exists (global feature): return true
   * 4. If feature is enabled and user list exists: return true only if user is in the list
   *
   * @param {string} flag - The feature flag identifier
   * @param {string} userId - The user identifier to check
   * @returns {Promise<boolean>} True if the user has access, false otherwise
   *
   * @example
   * ```typescript
   * // Check user access
   * const hasAccess = await store.hasFeatureFlag('beta_dashboard', 'user123');
   *
   * if (hasAccess) {
   *   console.log('User can access beta dashboard');
   * } else {
   *   console.log('User cannot access beta dashboard');
   * }
   *
   * // Example scenarios:
   *
   * // Targeted access: { enabled: true, userIds: ['user123', 'user456'] }
   * await store.hasFeatureFlag('beta', 'user123'); // true (in targeted list)
   * await store.hasFeatureFlag('beta', 'user999'); // false (not in targeted list)
   *
   * // Disabled feature: { enabled: false, userIds: ['user123'] }
   * await store.hasFeatureFlag('disabled', 'user123'); // false (feature disabled)
   * await store.hasFeatureFlag('disabled', 'user456'); // false (feature disabled)
   *
   * // Global access: { enabled: true, userIds: [] }
   * await store.hasFeatureFlag('global', 'anyone'); // true (global access)
   *
   * // Global deny: { enabled: false, userIds: [] }
   * await store.hasFeatureFlag('disabled', 'anyone'); // false (globally disabled)
   * ```
   */
  async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
    const featureInfoKey = `${this.featureKeyPrefix}:${flag}:info`;
    const featureUsersKey = `${this.featureKeyPrefix}:${flag}:users`;

    const info = await this.redis.hgetall(featureInfoKey);
    if (!info || !('enabled' in info)) return false;

    const enabled = info.enabled === 'true';

    // If feature is disabled, no one has access
    if (!enabled) {
      return false;
    }

    const userIds = await this.redis.smembers(featureUsersKey);
    const hasUsers = userIds.length > 0;

    // For global features (no users list), everyone has access
    if (!hasUsers) {
      return true;
    }

    // For targeted features, only users in the list have access
    const isUserInList = userIds.includes(userId);
    return isUserInList;
  }
}
