import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis-mock';
import { FeatureGuardStore } from '../src/feature-flag-cache.interface';
import {
  FEATURE_FLAG_KEY,
  FEATURE_FLAG_OPTIONS_KEY,
  FeatureFlagScope,
} from '../src/feature-flag.constants';
import { FeatureGuard } from '../src/feature-guard';
import { RedisFeatureFlagCache } from '../src/redis-feature-flag-cache';

describe('Error Handling', () => {
  let guard: FeatureGuard;
  let cache: jest.Mocked<FeatureGuardStore>;
  let reflector: jest.Mocked<Reflector>;
  let context: ExecutionContext;
  let redisCache: RedisFeatureFlagCache;
  let redis: InstanceType<typeof Redis>;

  beforeEach(() => {
    cache = {
      getFeature: jest.fn(),
      hasFeatureFlag: jest.fn(),
      setFeatureFlag: jest.fn(),
    };

    reflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new FeatureGuard(cache, reflector);

    // Mock context
    context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          __user_id: 'test-user',
          __is_admin: false,
          __feature_flags: {},
        }),
      }),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;

    // Setup Redis cache for Redis-specific error tests
    redis = new Redis();
    redisCache = new RedisFeatureFlagCache(redis);
  });

  describe('FeatureGuard Error Handling', () => {
    it('should handle Redis connection errors gracefully in getFeature', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      const connectionError = new Error('Redis connection failed');
      cache.getFeature.mockRejectedValue(connectionError);

      await expect(guard.canActivate(context)).rejects.toThrow('Redis connection failed');
    });

    it('should handle Redis connection errors gracefully in hasFeatureFlag', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      const connectionError = new Error('Redis connection failed');
      cache.hasFeatureFlag.mockRejectedValue(connectionError);

      await expect(guard.canActivate(context)).rejects.toThrow('Redis connection failed');
    });

    it('should handle timeout errors', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      const timeoutError = new Error('Operation timed out');
      cache.getFeature.mockRejectedValue(timeoutError);

      await expect(guard.canActivate(context)).rejects.toThrow('Operation timed out');
    });

    it('should handle network errors', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      const networkError = new Error('ECONNREFUSED');
      cache.getFeature.mockRejectedValue(networkError);

      await expect(guard.canActivate(context)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle SERVICE scope with errors gracefully', async () => {
      const flag = 'test_feature';
      const request = {
        __user_id: 'test-user',
        __is_admin: false,
        __feature_flags: {},
      };

      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue(request);
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
        return undefined;
      });

      const error = new Error('Store error');
      cache.getFeature.mockRejectedValue(error);

      await expect(guard.canActivate(context)).rejects.toThrow('Store error');
    });
  });

  describe('RedisFeatureFlagCache Error Handling', () => {
    it('should handle Redis command errors in setFeatureFlag', async () => {
      // Mock Redis to throw an error
      const mockRedis = {
        hmset: jest.fn().mockRejectedValue(new Error('Redis HMSET failed')),
        sadd: jest.fn(),
        del: jest.fn(),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      await expect(
        errorCache.setFeatureFlag({
          flag: 'test_feature',
          enabled: true,
          userIds: ['user1'],
        }),
      ).rejects.toThrow('Redis HMSET failed');
    });

    it('should handle Redis command errors in getFeature', async () => {
      const mockRedis = {
        hgetall: jest.fn().mockRejectedValue(new Error('Redis HGETALL failed')),
        smembers: jest.fn(),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      await expect(errorCache.getFeature('test_feature')).rejects.toThrow('Redis HGETALL failed');
    });

    it('should handle Redis command errors in hasFeatureFlag', async () => {
      const mockRedis = {
        hgetall: jest.fn().mockRejectedValue(new Error('Redis HGETALL failed')),
        smembers: jest.fn(),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      await expect(errorCache.hasFeatureFlag('test_feature', 'user1')).rejects.toThrow(
        'Redis HGETALL failed',
      );
    });

    it('should handle partial Redis failures in getFeature', async () => {
      const mockRedis = {
        hgetall: jest.fn().mockResolvedValue({ enabled: 'true' }),
        smembers: jest.fn().mockRejectedValue(new Error('Redis SMEMBERS failed')),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      await expect(errorCache.getFeature('test_feature')).rejects.toThrow('Redis SMEMBERS failed');
    });

    it('should handle corrupted data gracefully', async () => {
      const mockRedis = {
        hgetall: jest.fn().mockResolvedValue({ enabled: 'invalid_value' }),
        smembers: jest.fn().mockResolvedValue([]),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      const result = await errorCache.hasFeatureFlag('test_feature', 'user1');
      expect(result).toBe(false); // Should treat invalid value as false
    });

    it('should handle empty Redis responses', async () => {
      const mockRedis = {
        hgetall: jest.fn().mockResolvedValue({}),
        smembers: jest.fn().mockResolvedValue([]),
      } as any;

      const errorCache = new RedisFeatureFlagCache(mockRedis);

      const result = await errorCache.getFeature('test_feature');
      expect(result).toBeNull();
    });
  });

  describe('Malformed Data Handling', () => {
    it('should handle null responses from store', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue(null);
      cache.hasFeatureFlag.mockResolvedValue(false);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should handle undefined responses from store', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue(undefined as any);
      cache.hasFeatureFlag.mockResolvedValue(false);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should handle malformed feature objects', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      // Missing enabled property
      cache.getFeature.mockResolvedValue({} as any);
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });
  });
});
