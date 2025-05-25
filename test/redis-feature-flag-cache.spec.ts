import Redis from 'ioredis-mock';
import { RedisFeatureFlagCache } from '../src/redis-feature-flag-cache';

describe('RedisFeatureFlagCache', () => {
  let redis: InstanceType<typeof Redis>;
  let cache: RedisFeatureFlagCache;
  const defaultPrefix = 'crudmates:feature-guard';
  const customPrefix = 'custom:prefix';

  beforeEach(async () => {
    redis = new Redis();
    await redis.flushall();
    cache = new RedisFeatureFlagCache(redis);
  });

  describe('constructor', () => {
    it('should use default prefix if not provided', () => {
      expect(cache).toBeInstanceOf(RedisFeatureFlagCache);
    });

    it('should use custom prefix if provided', () => {
      const customCache = new RedisFeatureFlagCache(redis, customPrefix);
      expect(customCache).toBeInstanceOf(RedisFeatureFlagCache);
    });
  });

  describe('setFeatureFlag', () => {
    it('should set feature flag as enabled with users', async () => {
      const flag = 'test_feature';
      const userIds = ['user1', 'user2'];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds,
      });

      const info = await redis.hgetall(`${defaultPrefix}:${flag}:info`);
      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);

      expect(info.enabled).toBe('true');
      expect(users).toEqual(expect.arrayContaining(userIds));
    });

    it('should set feature flag as disabled with users', async () => {
      const flag = 'test_feature';
      const userIds = ['user1', 'user2'];

      await cache.setFeatureFlag({
        flag,
        enabled: false,
        userIds,
      });

      const info = await redis.hgetall(`${defaultPrefix}:${flag}:info`);
      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);

      expect(info.enabled).toBe('false');
      expect(users).toEqual(expect.arrayContaining(userIds));
    });

    it('should set global feature flag (no users)', async () => {
      const flag = 'global_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
      });

      const info = await redis.hgetall(`${defaultPrefix}:${flag}:info`);
      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);

      expect(info.enabled).toBe('true');
      expect(users).toHaveLength(0);
    });

    it('should clear users when setting flag without userIds', async () => {
      const flag = 'test_feature';
      const userIds = ['user1', 'user2'];

      // First set with users
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds,
      });

      // Then set without users
      await cache.setFeatureFlag({
        flag,
        enabled: true,
      });

      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);
      expect(users).toHaveLength(0);
    });

    it('should handle empty userIds array', async () => {
      const flag = 'test_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [],
      });

      const info = await redis.hgetall(`${defaultPrefix}:${flag}:info`);
      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);

      expect(info.enabled).toBe('true');
      expect(users).toHaveLength(0);
    });

    it('should handle duplicate userIds', async () => {
      const flag = 'test_feature';
      const userIds = ['user1', 'user1', 'user2'];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds,
      });

      const users = await redis.smembers(`${defaultPrefix}:${flag}:users`);
      expect(users).toHaveLength(2); // Redis sets automatically handle duplicates
      expect(users).toEqual(expect.arrayContaining(['user1', 'user2']));
    });
  });

  describe('getFeature', () => {
    it('should return null for non-existent feature', async () => {
      const result = await cache.getFeature('non_existent');
      expect(result).toBeNull();
    });

    it('should return feature info with users', async () => {
      const flag = 'test_feature';
      const userIds = ['user1', 'user2'];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds,
      });

      const result = await cache.getFeature(flag);

      expect(result).toEqual({
        enabled: true,
        userIds,
      });
    });

    it('should return feature info without users for global feature', async () => {
      const flag = 'global_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
      });

      const result = await cache.getFeature(flag);

      expect(result).toEqual({
        enabled: true,
        userIds: undefined,
      });
    });

    it('should return null when feature info exists but enabled field is missing', async () => {
      const flag = 'incomplete_feature';
      const featureInfoKey = `${defaultPrefix}:${flag}:info`;

      // Set incomplete info (missing enabled field)
      await redis.hmset(featureInfoKey, { someOtherField: 'value' });

      const result = await cache.getFeature(flag);
      expect(result).toBeNull();
    });

    it('should handle custom prefix correctly', async () => {
      const customCache = new RedisFeatureFlagCache(redis, customPrefix);
      const flag = 'custom_feature';

      await customCache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: ['user1'],
      });

      const result = await customCache.getFeature(flag);
      expect(result).toEqual({
        enabled: true,
        userIds: ['user1'],
      });

      // Verify it's using the custom prefix
      const info = await redis.hgetall(`${customPrefix}:${flag}:info`);
      expect(info.enabled).toBe('true');
    });
  });

  describe('hasFeatureFlag', () => {
    it('should return false for non-existent feature', async () => {
      const result = await cache.hasFeatureFlag('non_existent', 'user1');
      expect(result).toBe(false);
    });

    it('should return true for enabled feature with user in list', async () => {
      const flag = 'test_feature';
      const userId = 'user1';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [userId],
      });

      const result = await cache.hasFeatureFlag(flag, userId);
      expect(result).toBe(true);
    });

    it('should return false for enabled feature with user not in list', async () => {
      const flag = 'test_feature';
      const userId = 'user1';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: ['other_user'],
      });

      const users = await redis.smembers('crudmates:feature-guard:test_feature:users');
      console.log('Enabled, not in list, users:', users);
      const result = await cache.hasFeatureFlag(flag, userId);
      expect(result).toBe(false);
    });

    it('should return false for disabled feature with user not in list', async () => {
      const flag = 'test_feature';
      const userId = 'user1';

      await cache.setFeatureFlag({
        flag,
        enabled: false,
        userIds: ['other_user'],
      });

      const users = await redis.smembers('crudmates:feature-guard:test_feature:users');
      console.log('Disabled, not in list, users:', users);
      const result = await cache.hasFeatureFlag(flag, userId);
      expect(result).toBe(false);
    });

    it('should return false for disabled feature with user in list', async () => {
      const flag = 'test_feature';
      const userId = 'user1';

      await cache.setFeatureFlag({
        flag,
        enabled: false,
        userIds: [userId],
      });

      const result = await cache.hasFeatureFlag(flag, userId);
      expect(result).toBe(false);
    });

    it('should return true for enabled global feature', async () => {
      const flag = 'global_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
      });

      const result = await cache.hasFeatureFlag(flag, 'any_user');
      expect(result).toBe(true);
    });

    it('should return false for disabled global feature', async () => {
      const flag = 'global_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: false,
      });

      const result = await cache.hasFeatureFlag(flag, 'any_user');
      expect(result).toBe(false);
    });

    it('should return false when feature info is incomplete', async () => {
      const flag = 'incomplete_feature';
      const featureInfoKey = `${defaultPrefix}:${flag}:info`;

      // Set incomplete info (missing enabled field)
      await redis.hmset(featureInfoKey, { someOtherField: 'value' });

      const result = await cache.hasFeatureFlag(flag, 'user1');
      expect(result).toBe(false);
    });

    it('should handle string "false" as disabled', async () => {
      const flag = 'string_false_feature';
      const featureInfoKey = `${defaultPrefix}:${flag}:info`;

      // Manually set enabled as string "false"
      await redis.hmset(featureInfoKey, { enabled: 'false' });

      const result = await cache.hasFeatureFlag(flag, 'user1');
      expect(result).toBe(false);
    });

    it('should handle string "true" as enabled for global feature', async () => {
      const flag = 'string_true_feature';
      const featureInfoKey = `${defaultPrefix}:${flag}:info`;

      // Manually set enabled as string "true"
      await redis.hmset(featureInfoKey, { enabled: 'true' });

      const result = await cache.hasFeatureFlag(flag, 'user1');
      expect(result).toBe(true);
    });

    it('should work with custom prefix', async () => {
      const customCache = new RedisFeatureFlagCache(redis, customPrefix);
      const flag = 'custom_feature';

      await customCache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: ['user1'],
      });

      const result = await customCache.hasFeatureFlag(flag, 'user1');
      expect(result).toBe(true);

      const resultOtherUser = await customCache.hasFeatureFlag(flag, 'user2');
      expect(resultOtherUser).toBe(false);
    });
  });
});
