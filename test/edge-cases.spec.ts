import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis-mock';
import {
  FEATURE_FLAG_KEY,
  FEATURE_FLAG_OPTIONS_KEY,
  FeatureFlagScope,
} from '../src/feature-flag.constants';
import { FeatureGuard } from '../src/feature-guard';
import { RedisFeatureFlagCache } from '../src/redis-feature-flag-cache';

describe('Edge Cases and Boundary Tests', () => {
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

  const createMockContext = (
    userId?: string | null,
    isAdmin = false,
    existingFlags: Record<string, boolean> = {},
  ): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          __user_id: userId,
          __is_admin: isAdmin,
          __feature_flags: existingFlags,
        }),
      }),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext);

  describe('Unusual Input Handling', () => {
    it('should handle extremely long feature flag names', async () => {
      const longFlag = 'a'.repeat(1000); // 1000 character flag name
      const userId = 'test_user';

      await cache.setFeatureFlag({
        flag: longFlag,
        enabled: true,
        userIds: [userId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [longFlag];
        return undefined;
      });

      const context = createMockContext(userId);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle extremely long user IDs', async () => {
      const flag = 'test_feature';
      const longUserId = 'user_' + 'x'.repeat(1000); // Very long user ID

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [longUserId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      const context = createMockContext(longUserId);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle special characters in feature flag names', async () => {
      const specialFlags = [
        'feature-with-dashes',
        'feature_with_underscores',
        'feature.with.dots',
        'feature:with:colons',
        'feature@with@symbols',
        'feature with spaces',
        'feature/with/slashes',
        'feature\\with\\backslashes',
        'feature|with|pipes',
        'feature+with+plus',
        'feature=with=equals',
        'feature?with?questions',
        'feature#with#hash',
        'feature%with%percent',
        'feature&with&ampersand',
        'feature*with*asterisk',
        'feature(with)parentheses',
        'feature[with]brackets',
        'feature{with}braces',
        'feature<with>angles',
        'feature"with"quotes',
        "feature'with'apostrophes",
        'feature`with`backticks',
        'feature~with~tildes',
        'feature!with!exclamation',
        'feature$with$dollar',
        'feature^with^caret',
      ];

      const userId = 'test_user';

      for (const flag of specialFlags) {
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: [userId],
        });

        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          return undefined;
        });

        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should handle special characters in user IDs', async () => {
      const flag = 'test_feature';
      const specialUserIds = [
        'user-with-dashes',
        'user_with_underscores',
        'user.with.dots',
        'user@domain.com',
        'user+tag@domain.com',
        'user123',
        '123user',
        'user-123-test',
        'UPPERCASE_USER',
        'MixedCase_User',
        'user with spaces',
        'user/with/slashes',
        'user\\with\\backslashes',
        'user:with:colons',
        'user|with|pipes',
        'user=with=equals',
        'user?with?questions',
        'user#with#hash',
        'user%with%percent',
        'user&with&ampersand',
        'user*with*asterisk',
        'user(with)parentheses',
        'user[with]brackets',
        'user{with}braces',
        'user<with>angles',
        'user"with"quotes',
        "user'with'apostrophes",
        'user`with`backticks',
        'user~with~tildes',
        'user!with!exclamation',
        'user$with$dollar',
        'user^with^caret',
        'user+with+plus',
      ];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: specialUserIds,
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      for (const userId of specialUserIds) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should handle empty string feature flag names', async () => {
      const emptyFlag = '';
      const userId = 'test_user';

      await cache.setFeatureFlag({
        flag: emptyFlag,
        enabled: true,
        userIds: [userId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [emptyFlag];
        return undefined;
      });

      const context = createMockContext(userId);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle empty string user IDs', async () => {
      const flag = 'test_feature';
      const emptyUserId = '';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [emptyUserId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      const context = createMockContext(emptyUserId);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle maximum number of users in a feature flag', async () => {
      const flag = 'max_users_test';
      const maxUsers = Array.from({ length: 100000 }, (_, i) => `user${i}`); // 100k users

      const startTime = Date.now();
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: maxUsers,
      });
      const endTime = Date.now();

      console.log(`Setting 100k users took ${endTime - startTime}ms`);

      // Test a few random users
      const testUsers = [maxUsers[0], maxUsers[50000], maxUsers[99999]];

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      for (const userId of testUsers) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      // Test user not in list
      const context = createMockContext('not_in_list');
      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should handle zero users in feature flag', async () => {
      const flag = 'zero_users_test';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      const context = createMockContext('any_user');
      const result = await guard.canActivate(context);
      expect(result).toBe(true); // Empty array should be treated as global access
    });

    it('should handle single user in feature flag', async () => {
      const flag = 'single_user_test';
      const singleUser = 'only_user';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [singleUser],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      // Test the single user
      const allowedContext = createMockContext(singleUser);
      const allowedResult = await guard.canActivate(allowedContext);
      expect(allowedResult).toBe(true);

      // Test different user
      const deniedContext = createMockContext('different_user');
      const deniedResult = await guard.canActivate(deniedContext);
      expect(deniedResult).toBe(false);
    });

    it('should handle rapid feature flag toggles', async () => {
      const flag = 'toggle_test';
      const userId = 'test_user';

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      const context = createMockContext(userId);

      // Rapidly toggle the feature flag
      for (let i = 0; i < 100; i++) {
        const enabled = i % 2 === 0;
        await cache.setFeatureFlag({
          flag,
          enabled,
          userIds: enabled ? [userId] : undefined,
        });

        const result = await guard.canActivate(context);
        if (enabled) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle potential injection attempts in feature flag names', async () => {
      const maliciousFlags = [
        'feature"; DROP TABLE users; --',
        "feature'; DELETE FROM features; --",
        'feature`; rm -rf /; `',
        'feature$(rm -rf /)',
        'feature<script>alert("xss")</script>',
        'feature${process.exit(1)}',
        'feature#{system("rm -rf /")}',
        'feature\\x00\\x01\\x02',
        'feature\n\r\t',
        'feature\u0000\u0001\u0002',
      ];

      const userId = 'test_user';

      for (const flag of maliciousFlags) {
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: [userId],
        });

        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          return undefined;
        });

        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true); // Should handle safely
      }
    });

    it('should handle potential injection attempts in user IDs', async () => {
      const flag = 'test_feature';
      const maliciousUserIds = [
        'user"; DROP TABLE users; --',
        "user'; DELETE FROM features; --",
        'user`; rm -rf /; `',
        'user$(rm -rf /)',
        'user<script>alert("xss")</script>',
        'user${process.exit(1)}',
        'user#{system("rm -rf /")}',
        'user\\x00\\x01\\x02',
        'user\n\r\t',
        'user\u0000\u0001\u0002',
      ];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: maliciousUserIds,
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      for (const userId of maliciousUserIds) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true); // Should handle safely
      }
    });

    it('should handle admin privilege escalation attempts', async () => {
      const flag = 'admin_only_feature';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: ['real_admin'],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      // Test various admin escalation attempts
      const escalationAttempts = [
        { __user_id: 'fake_admin', __is_admin: 'true' }, // String instead of boolean
        { __user_id: 'fake_admin', __is_admin: 1 }, // Number instead of boolean
        { __user_id: 'fake_admin', __is_admin: 'false' }, // String false
        { __user_id: 'fake_admin', __is_admin: 0 }, // Number false
        { __user_id: 'fake_admin', __is_admin: null }, // Null
        { __user_id: 'fake_admin', __is_admin: undefined }, // Undefined
        { __user_id: 'fake_admin', __is_admin: {} }, // Object
        { __user_id: 'fake_admin', __is_admin: [] }, // Array
      ];

      for (const attempt of escalationAttempts) {
        const context = {
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue({
              ...attempt,
              __feature_flags: {},
            }),
          }),
          getHandler: jest.fn(),
        } as unknown as ExecutionContext;

        const result = await guard.canActivate(context);
        expect(result).toBe(false); // Should deny access for non-boolean admin flags
      }
    });

    it('should handle request object manipulation attempts', async () => {
      const flag = 'test_feature';
      const userId = 'test_user';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [userId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
        return undefined;
      });

      // Test request with pre-existing malicious flags
      const maliciousRequest = {
        __user_id: userId,
        __is_admin: false,
        __feature_flags: {
          [flag]: true, // Pre-existing flag that might be wrong
          malicious_flag: true,
          admin_override: true,
        },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(maliciousRequest),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // The guard should overwrite the pre-existing flag with the correct value
      expect(maliciousRequest.__feature_flags[flag]).toBe(true);
      // But should preserve other flags (not overwrite them)
      expect(maliciousRequest.__feature_flags.malicious_flag).toBe(true);
      expect(maliciousRequest.__feature_flags.admin_override).toBe(true);
    });
  });

  describe('Data Consistency Edge Cases', () => {
    it('should handle concurrent updates to the same feature flag', async () => {
      const flag = 'concurrent_update_test';
      const users1 = ['user1', 'user2'];
      const users2 = ['user3', 'user4'];

      // Simulate concurrent updates
      const promises = [
        cache.setFeatureFlag({ flag, enabled: true, userIds: users1 }),
        cache.setFeatureFlag({ flag, enabled: true, userIds: users2 }),
      ];

      await Promise.all(promises);

      // The last update should win
      const feature = await cache.getFeature(flag);
      expect(feature?.enabled).toBe(true);
      // One of the user lists should be present (last writer wins)
      expect(feature?.userIds).toBeDefined();
      expect(feature?.userIds?.length).toBeGreaterThan(0);
    });

    it('should handle feature flag deletion during access', async () => {
      const flag = 'deletion_test';
      const userId = 'test_user';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [userId],
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      // Delete the feature flag by setting it to disabled with no users
      await cache.setFeatureFlag({
        flag,
        enabled: false,
        userIds: [],
      });

      const context = createMockContext(userId);
      const result = await guard.canActivate(context);
      expect(result).toBe(false); // Should deny access to deleted/disabled feature
    });

    it('should handle corrupted Redis data gracefully', async () => {
      const flag = 'corrupted_test';

      // Manually corrupt the data in Redis
      const featureInfoKey = `crudmates:feature-guard:${flag}:info`;
      await redis.hmset(featureInfoKey, {
        enabled: 'not_a_boolean',
        corrupted_field: 'corrupted_value',
      });

      const result = await cache.hasFeatureFlag(flag, 'test_user');
      expect(result).toBe(false); // Should handle corruption gracefully
    });

    it('should handle partial Redis data', async () => {
      const flag = 'partial_test';

      // Set only the info without users
      const featureInfoKey = `crudmates:feature-guard:${flag}:info`;
      await redis.hmset(featureInfoKey, { enabled: 'true' });

      const result = await cache.hasFeatureFlag(flag, 'test_user');
      expect(result).toBe(true); // Should treat as global access when no users set
    });

    it('should handle Redis key expiration', async () => {
      const flag = 'expiration_test';
      const userId = 'test_user';

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: [userId],
      });

      // Manually expire the info key
      const featureInfoKey = `crudmates:feature-guard:${flag}:info`;
      await redis.del(featureInfoKey);

      const result = await cache.hasFeatureFlag(flag, userId);
      expect(result).toBe(false); // Should handle missing info gracefully
    });
  });

  describe('Memory and Resource Edge Cases', () => {
    it('should handle very large user lists without memory issues', async () => {
      const flag = 'memory_test';
      const largeUserList = Array.from({ length: 50000 }, (_, i) => `user${i}`);

      const startMemory = process.memoryUsage().heapUsed;

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: largeUserList,
      });

      const feature = await cache.getFeature(flag);
      expect(feature?.userIds).toHaveLength(50000);

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;

      console.log(`Memory increase for 50k users: ${memoryIncrease / 1024 / 1024}MB`);

      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should handle rapid creation and deletion of feature flags', async () => {
      const baseFlag = 'rapid_creation_test';
      const iterations = 1000;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const flag = `${baseFlag}_${i}`;
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: [`user${i}`],
        });

        // Immediately "delete" by disabling
        await cache.setFeatureFlag({
          flag,
          enabled: false,
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`${iterations} create/delete cycles completed in ${duration}ms`);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds
    });
  });

  describe('Unicode and Internationalization', () => {
    it('should handle Unicode characters in feature flag names', async () => {
      const unicodeFlags = [
        'feature_测试',
        'feature_тест',
        'feature_テスト',
        'feature_🚀',
        'feature_🎯',
        'feature_✅',
        'feature_❌',
        'feature_🔥',
        'feature_💡',
        'feature_🌟',
        'feature_العربية',
        'feature_עברית',
        'feature_हिंदी',
        'feature_中文',
        'feature_日本語',
        'feature_한국어',
        'feature_Ελληνικά',
        'feature_Русский',
        'feature_Français',
        'feature_Español',
        'feature_Português',
        'feature_Deutsch',
        'feature_Italiano',
        'feature_Nederlands',
        'feature_Polski',
        'feature_Türkçe',
        'feature_Čeština',
        'feature_Magyar',
        'feature_Română',
        'feature_Български',
        'feature_Српски',
        'feature_Hrvatski',
        'feature_Slovenščina',
        'feature_Slovenčina',
        'feature_Lietuvių',
        'feature_Latviešu',
        'feature_Eesti',
        'feature_Suomi',
        'feature_Svenska',
        'feature_Norsk',
        'feature_Dansk',
        'feature_Íslenska',
      ];

      const userId = 'test_user';

      for (const flag of unicodeFlags) {
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: [userId],
        });

        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          return undefined;
        });

        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should handle Unicode characters in user IDs', async () => {
      const flag = 'unicode_users_test';
      const unicodeUserIds = [
        'user_测试',
        'user_тест',
        'user_テスト',
        'user_🚀',
        'user_العربية',
        'user_עברית',
        'user_हिंदी',
        'user_中文',
        'user_日本語',
        'user_한국어',
        'user_Ελληνικά',
        'user_Русский',
        'user_Français',
        'user_Español',
        'user_Português',
        'user_Deutsch',
        'user_Italiano',
        'user_Nederlands',
        'user_Polski',
        'user_Türkçe',
      ];

      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: unicodeUserIds,
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      for (const userId of unicodeUserIds) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });
  });
});
