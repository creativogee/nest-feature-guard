import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis-mock';
import { FEATURE_FLAG_KEY } from '../src/feature-flag.constants';
import { FeatureGuard } from '../src/feature-guard';
import { RedisFeatureFlagCache } from '../src/redis-feature-flag-cache';

describe('Performance Tests', () => {
  let guard: FeatureGuard;
  let cache: RedisFeatureFlagCache;
  let reflector: jest.Mocked<Reflector>;
  let redis: InstanceType<typeof Redis>;

  beforeEach(async () => {
    redis = new Redis();
    await redis.flushall();
    cache = new RedisFeatureFlagCache(redis);

    reflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new FeatureGuard(cache, reflector);
  });

  const createMockContext = (userId: string, isAdmin = false): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          __user_id: userId,
          __is_admin: isAdmin,
          __feature_flags: {},
        }),
      }),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext);

  describe('High Volume Operations', () => {
    it('should handle 1000 concurrent feature flag checks', async () => {
      const flag = 'performance_test';
      const userIds = Array.from({ length: 1000 }, (_, i) => `user${i}`);

      // Setup feature flag
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: userIds.slice(0, 500), // First 500 users have access
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      const startTime = Date.now();

      // Create 1000 concurrent checks
      const promises = userIds.map(async (userId) => {
        const context = createMockContext(userId);
        return guard.canActivate(context);
      });

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // Verify results
      expect(results.slice(0, 500)).toEqual(Array(500).fill(true)); // First 500 should have access
      expect(results.slice(500)).toEqual(Array(500).fill(false)); // Last 500 should not

      // Performance assertion - should complete within reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`1000 concurrent checks completed in ${duration}ms`);
    });

    it('should handle rapid sequential feature flag updates', async () => {
      const flag = 'rapid_update_test';
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await cache.setFeatureFlag({
          flag,
          enabled: i % 2 === 0, // Alternate between enabled/disabled
          userIds: [`user${i}`],
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      console.log(`${iterations} sequential updates completed in ${duration}ms`);
    });

    it('should handle large user lists efficiently', async () => {
      const flag = 'large_userlist_test';
      const largeUserList = Array.from({ length: 10000 }, (_, i) => `user${i}`);

      const startTime = Date.now();

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: largeUserList,
      });

      const feature = await cache.getFeature(flag);
      const endTime = Date.now();

      expect(feature?.enabled).toBe(true);
      expect(feature?.userIds).toHaveLength(10000);

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      console.log(`Large user list (10k users) operation completed in ${duration}ms`);
    });

    it('should handle mixed read/write operations under load', async () => {
      const flags = Array.from({ length: 50 }, (_, i) => `flag${i}`);
      const users = Array.from({ length: 100 }, (_, i) => `user${i}`);

      const startTime = Date.now();

      // Create mixed operations
      const operations = [];

      // 25% writes
      for (let i = 0; i < 25; i++) {
        operations.push(
          cache.setFeatureFlag({
            flag: flags[i % flags.length],
            enabled: Math.random() > 0.5,
            userIds: users.slice(0, Math.floor(Math.random() * 20)),
          }),
        );
      }

      // 75% reads
      for (let i = 0; i < 75; i++) {
        const flag = flags[Math.floor(Math.random() * flags.length)];
        const user = users[Math.floor(Math.random() * users.length)];
        operations.push(cache.hasFeatureFlag(flag, user));
      }

      const results = await Promise.all(operations);
      const endTime = Date.now();

      expect(results).toHaveLength(100);

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

      console.log(`Mixed operations (25 writes, 75 reads) completed in ${duration}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle feature flags with varying user list sizes', async () => {
      const testCases = [
        { flag: 'small_list', userCount: 10 },
        { flag: 'medium_list', userCount: 1000 },
        { flag: 'large_list', userCount: 10000 },
        { flag: 'empty_list', userCount: 0 },
      ];

      for (const testCase of testCases) {
        const userIds = Array.from({ length: testCase.userCount }, (_, i) => `user${i}`);

        const startTime = Date.now();

        await cache.setFeatureFlag({
          flag: testCase.flag,
          enabled: true,
          userIds: testCase.userCount > 0 ? userIds : undefined,
        });

        const feature = await cache.getFeature(testCase.flag);
        const endTime = Date.now();

        expect(feature?.enabled).toBe(true);
        if (testCase.userCount > 0) {
          expect(feature?.userIds).toHaveLength(testCase.userCount);
        } else {
          expect(feature?.userIds).toBeUndefined();
        }

        const duration = endTime - startTime;
        console.log(`${testCase.flag} (${testCase.userCount} users) completed in ${duration}ms`);
      }
    });

    it('should efficiently clean up old user lists when updating', async () => {
      const flag = 'cleanup_test';

      // Set initial large user list
      const initialUsers = Array.from({ length: 5000 }, (_, i) => `initial_user${i}`);
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: initialUsers,
      });

      // Update to smaller list
      const newUsers = Array.from({ length: 10 }, (_, i) => `new_user${i}`);
      const startTime = Date.now();

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: newUsers,
      });

      const feature = await cache.getFeature(flag);
      const endTime = Date.now();

      expect(feature?.userIds).toHaveLength(10);
      expect(feature?.userIds).toEqual(expect.arrayContaining(newUsers));
      // Verify old users are not present
      expect(feature?.userIds).not.toEqual(
        expect.arrayContaining(['initial_user0', 'initial_user1']),
      );

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(500); // Should be fast

      console.log(`User list cleanup completed in ${duration}ms`);
    });
  });

  describe('Concurrent Access Patterns', () => {
    it('should handle concurrent reads and writes to same feature flag', async () => {
      const flag = 'concurrent_test';
      const users = Array.from({ length: 100 }, (_, i) => `user${i}`);

      // Initial setup
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: users.slice(0, 50),
      });

      const operations = [];

      // Concurrent reads
      for (let i = 0; i < 50; i++) {
        operations.push(cache.hasFeatureFlag(flag, users[i]));
      }

      // Concurrent writes (updates)
      for (let i = 0; i < 10; i++) {
        operations.push(
          cache.setFeatureFlag({
            flag,
            enabled: true,
            userIds: users.slice(i * 10, (i + 1) * 10),
          }),
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      // Should complete without errors
      expect(results).toHaveLength(60);

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000);

      console.log(`Concurrent read/write operations completed in ${duration}ms`);
    });

    it('should handle multiple feature flags being accessed simultaneously', async () => {
      const flags = Array.from({ length: 20 }, (_, i) => `concurrent_flag${i}`);
      const user = 'test_user';

      // Setup all flags
      for (const flag of flags) {
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: [user],
        });
      }

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flags[0]]; // Use first flag for guard tests
        return undefined;
      });

      const startTime = Date.now();

      // Concurrent access to all flags
      const promises = flags.map((flag) => cache.hasFeatureFlag(flag, user));

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toEqual(Array(20).fill(true));

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000);

      console.log(`${flags.length} concurrent flag checks completed in ${duration}ms`);
    });
  });

  describe('Scalability Tests', () => {
    it('should maintain performance with increasing number of feature flags', async () => {
      const flagCounts = [10, 50, 100, 200];
      const user = 'scale_test_user';

      for (const flagCount of flagCounts) {
        const flags = Array.from({ length: flagCount }, (_, i) => `scale_flag${i}`);

        // Setup flags
        const setupStart = Date.now();
        for (const flag of flags) {
          await cache.setFeatureFlag({
            flag,
            enabled: true,
            userIds: [user],
          });
        }
        const setupEnd = Date.now();

        // Test access performance
        const accessStart = Date.now();
        const promises = flags.map((flag) => cache.hasFeatureFlag(flag, user));
        const results = await Promise.all(promises);
        const accessEnd = Date.now();

        expect(results).toEqual(Array(flagCount).fill(true));

        const setupDuration = setupEnd - setupStart;
        const accessDuration = accessEnd - accessStart;

        console.log(`${flagCount} flags: setup=${setupDuration}ms, access=${accessDuration}ms`);

        // Performance should scale reasonably
        expect(accessDuration).toBeLessThan(flagCount * 10); // Max 10ms per flag
      }
    });

    it('should handle burst traffic patterns', async () => {
      const flag = 'burst_test';
      const users = Array.from({ length: 500 }, (_, i) => `burst_user${i}`);

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: users,
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      // Simulate burst traffic - 3 waves of concurrent requests
      const waves = [100, 200, 300];

      for (const waveSize of waves) {
        const startTime = Date.now();

        const promises = Array.from({ length: waveSize }, (_, i) => {
          const context = createMockContext(users[i % users.length]);
          return guard.canActivate(context);
        });

        const results = await Promise.all(promises);
        const endTime = Date.now();

        expect(results).toEqual(Array(waveSize).fill(true));

        const duration = endTime - startTime;
        console.log(`Wave of ${waveSize} requests completed in ${duration}ms`);

        // Should handle bursts efficiently
        expect(duration).toBeLessThan(waveSize * 5); // Max 5ms per request
      }
    });
  });
});
