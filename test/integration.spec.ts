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

describe('Integration Tests', () => {
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
    userId?: string,
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

  describe('Complete Feature Flag Lifecycle', () => {
    it('should handle complete feature rollout scenario', async () => {
      const flag = 'new_dashboard';
      const allUsers = Array.from({ length: 100 }, (_, i) => `user${i}`);

      // Phase 1: Feature disabled for everyone
      await cache.setFeatureFlag({
        flag,
        enabled: false,
      });

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flag];
        return undefined;
      });

      // Test that no one has access
      for (let i = 0; i < 5; i++) {
        const context = createMockContext(allUsers[i]);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }

      // Phase 2: Beta rollout to 10% of users
      const betaUsers = allUsers.slice(0, 10);
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: betaUsers,
      });

      // Test beta users have access
      for (const userId of betaUsers) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      // Test non-beta users don't have access
      for (let i = 10; i < 15; i++) {
        const context = createMockContext(allUsers[i]);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }

      // Phase 3: Expand to 50% of users
      const expandedUsers = allUsers.slice(0, 50);
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        userIds: expandedUsers,
      });

      // Test expanded users have access
      for (let i = 0; i < 50; i++) {
        const context = createMockContext(allUsers[i]);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      // Phase 4: Full rollout (global access)
      await cache.setFeatureFlag({
        flag,
        enabled: true,
        // No userIds = global access
      });

      // Test all users have access
      for (let i = 0; i < 10; i++) {
        const context = createMockContext(allUsers[i]);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      // Phase 5: Emergency rollback
      await cache.setFeatureFlag({
        flag,
        enabled: false,
      });

      // Test no one has access after rollback
      for (let i = 0; i < 5; i++) {
        const context = createMockContext(allUsers[i]);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }
    });

    it('should handle A/B testing scenario', async () => {
      const flagA = 'feature_variant_a';
      const flagB = 'feature_variant_b';
      const users = Array.from({ length: 100 }, (_, i) => `user${i}`);

      // Split users into two groups
      const groupA = users.slice(0, 50);
      const groupB = users.slice(50);

      // Setup A/B test
      await Promise.all([
        cache.setFeatureFlag({
          flag: flagA,
          enabled: true,
          userIds: groupA,
        }),
        cache.setFeatureFlag({
          flag: flagB,
          enabled: true,
          userIds: groupB,
        }),
      ]);

      // Test Group A users
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flagA];
        return undefined;
      });

      for (const userId of groupA.slice(0, 5)) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      for (const userId of groupB.slice(0, 5)) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }

      // Test Group B users
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [flagB];
        return undefined;
      });

      for (const userId of groupB.slice(0, 5)) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }

      for (const userId of groupA.slice(0, 5)) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }
    });

    it('should handle complex multi-feature scenario', async () => {
      const features = {
        premium_features: ['premium_user1', 'premium_user2'],
        beta_features: ['beta_user1', 'beta_user2', 'premium_user1'],
        admin_panel: [], // Global for all users
        experimental: ['beta_user1'],
      };

      // Setup all features
      for (const [flag, userIds] of Object.entries(features)) {
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: userIds.length > 0 ? userIds : undefined,
        });
      }

      // Test premium user access
      const premiumContext = createMockContext('premium_user1');

      // Should have premium features
      reflector.get.mockReturnValue(['premium_features']);
      expect(await guard.canActivate(premiumContext)).toBe(true);

      // Should have beta features
      reflector.get.mockReturnValue(['beta_features']);
      expect(await guard.canActivate(premiumContext)).toBe(true);

      // Should have admin panel (global)
      reflector.get.mockReturnValue(['admin_panel']);
      expect(await guard.canActivate(premiumContext)).toBe(true);

      // Should NOT have experimental
      reflector.get.mockReturnValue(['experimental']);
      expect(await guard.canActivate(premiumContext)).toBe(false);

      // Test beta user access
      const betaContext = createMockContext('beta_user1');

      // Should NOT have premium features
      reflector.get.mockReturnValue(['premium_features']);
      expect(await guard.canActivate(betaContext)).toBe(false);

      // Should have beta features
      reflector.get.mockReturnValue(['beta_features']);
      expect(await guard.canActivate(betaContext)).toBe(true);

      // Should have experimental
      reflector.get.mockReturnValue(['experimental']);
      expect(await guard.canActivate(betaContext)).toBe(true);

      // Test regular user access
      const regularContext = createMockContext('regular_user');

      // Should NOT have premium features
      reflector.get.mockReturnValue(['premium_features']);
      expect(await guard.canActivate(regularContext)).toBe(false);

      // Should NOT have beta features
      reflector.get.mockReturnValue(['beta_features']);
      expect(await guard.canActivate(regularContext)).toBe(false);

      // Should have admin panel (global)
      reflector.get.mockReturnValue(['admin_panel']);
      expect(await guard.canActivate(regularContext)).toBe(true);
    });
  });

  describe('Service Scope Integration', () => {
    it('should handle mixed controller and service scope features', async () => {
      const controllerFlag = 'api_access';
      const serviceFlag = 'enhanced_processing';
      const userId = 'test_user';

      // Setup flags
      await Promise.all([
        cache.setFeatureFlag({
          flag: controllerFlag,
          enabled: true,
          userIds: [userId],
        }),
        cache.setFeatureFlag({
          flag: serviceFlag,
          enabled: true,
          userIds: [userId],
        }),
      ]);

      const request = {
        __user_id: userId,
        __is_admin: false,
        __feature_flags: {},
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      // Test controller scope (should block if no access)
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [controllerFlag];
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.CONTROLLER };
        return undefined;
      });

      const controllerResult = await guard.canActivate(context);
      expect(controllerResult).toBe(true);

      // Test service scope (should always pass but set flag)
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [serviceFlag];
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
        return undefined;
      });

      const serviceResult = await guard.canActivate(context);
      expect(serviceResult).toBe(true);
      expect(request.__feature_flags[serviceFlag]).toBe(true);

      // Test service scope with disabled feature
      await cache.setFeatureFlag({
        flag: serviceFlag,
        enabled: false,
      });

      const disabledServiceResult = await guard.canActivate(context);
      expect(disabledServiceResult).toBe(true); // Should still pass
      expect(request.__feature_flags[serviceFlag]).toBe(false); // But flag should be false
    });

    it('should accumulate multiple service flags in request', async () => {
      const flags = ['feature1', 'feature2', 'feature3'];
      const userId = 'test_user';

      // Setup flags with different states
      await Promise.all([
        cache.setFeatureFlag({ flag: flags[0], enabled: true, userIds: [userId] }),
        cache.setFeatureFlag({ flag: flags[1], enabled: false }),
        cache.setFeatureFlag({ flag: flags[2], enabled: true }), // Global
      ]);

      const request = {
        __user_id: userId,
        __is_admin: false,
        __feature_flags: {},
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      // Process each flag
      for (const flag of flags) {
        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
          return undefined;
        });

        const result = await guard.canActivate(context);
        expect(result).toBe(true); // Service scope always passes
      }

      // Check accumulated flags
      expect(request.__feature_flags).toEqual({
        feature1: true, // User has access
        feature2: false, // Disabled
        feature3: true, // Global access
      });

      // Test static method
      expect(FeatureGuard.isFeatureEnabled(request, 'feature1')).toBe(true);
      expect(FeatureGuard.isFeatureEnabled(request, 'feature2')).toBe(false);
      expect(FeatureGuard.isFeatureEnabled(request, 'feature3')).toBe(true);
    });
  });

  describe('Admin Override Integration', () => {
    it('should handle admin override in complex scenarios', async () => {
      const restrictedFlag = 'super_secret_feature';
      const regularFlag = 'normal_feature';

      // Setup restricted feature for specific users only
      await Promise.all([
        cache.setFeatureFlag({
          flag: restrictedFlag,
          enabled: true,
          userIds: ['special_user'],
        }),
        cache.setFeatureFlag({
          flag: regularFlag,
          enabled: true,
          userIds: ['regular_user'],
        }),
      ]);

      // Test admin access to restricted feature
      const adminContext = createMockContext(undefined, true); // Admin with no userId

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [restrictedFlag];
        return undefined;
      });

      const adminResult = await guard.canActivate(adminContext);
      expect(adminResult).toBe(true); // Admin should bypass

      // Test admin access to regular feature
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [regularFlag];
        return undefined;
      });

      const adminRegularResult = await guard.canActivate(adminContext);
      expect(adminRegularResult).toBe(true); // Admin should bypass

      // Test non-admin access to restricted feature
      const regularContext = createMockContext('regular_user');

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [restrictedFlag];
        return undefined;
      });

      const regularRestrictedResult = await guard.canActivate(regularContext);
      expect(regularRestrictedResult).toBe(false); // Should be denied

      // Test admin with service scope
      const adminServiceContext = createMockContext('admin_user', true);
      const request = adminServiceContext.switchToHttp().getRequest();

      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [restrictedFlag];
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
        return undefined;
      });

      const adminServiceResult = await guard.canActivate(adminServiceContext);
      expect(adminServiceResult).toBe(true); // Admin bypass
      // Note: Admin bypass happens before feature flag processing, so flag won't be set
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle gradual feature rollout with monitoring', async () => {
      const flag = 'payment_v2';
      const allUsers = Array.from({ length: 1000 }, (_, i) => `user${i}`);

      // Track rollout phases
      const rolloutPhases = [
        { percentage: 1, users: allUsers.slice(0, 10) }, // 1% - Internal testing
        { percentage: 5, users: allUsers.slice(0, 50) }, // 5% - Beta users
        { percentage: 25, users: allUsers.slice(0, 250) }, // 25% - Early adopters
        { percentage: 100, users: [] }, // 100% - Global rollout
      ];

      for (const phase of rolloutPhases) {
        // Update feature flag
        await cache.setFeatureFlag({
          flag,
          enabled: true,
          userIds: phase.users.length > 0 ? phase.users : undefined,
        });

        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          return undefined;
        });

        // Test sample of users
        const sampleSize = Math.min(20, allUsers.length);
        const sampleUsers = allUsers.slice(0, sampleSize);

        let accessCount = 0;
        for (const userId of sampleUsers) {
          const context = createMockContext(userId);
          const hasAccess = await guard.canActivate(context);
          if (hasAccess) accessCount++;
        }

        if (phase.percentage === 100) {
          // Global rollout - all should have access
          expect(accessCount).toBe(sampleSize);
        } else {
          // Targeted rollout - only specific users should have access
          const expectedAccess = sampleUsers.filter((user) => phase.users.includes(user)).length;
          expect(accessCount).toBe(expectedAccess);
        }

        console.log(`Phase ${phase.percentage}%: ${accessCount}/${sampleSize} users have access`);
      }
    });

    it('should handle feature dependencies', async () => {
      const baseFeature = 'analytics_base';
      const advancedFeature = 'analytics_advanced';
      const premiumFeature = 'analytics_premium';

      const users = {
        basic: 'basic_user',
        advanced: 'advanced_user',
        premium: 'premium_user',
      };

      // Setup feature hierarchy
      await Promise.all([
        cache.setFeatureFlag({
          flag: baseFeature,
          enabled: true,
          userIds: [users.basic, users.advanced, users.premium],
        }),
        cache.setFeatureFlag({
          flag: advancedFeature,
          enabled: true,
          userIds: [users.advanced, users.premium],
        }),
        cache.setFeatureFlag({
          flag: premiumFeature,
          enabled: true,
          userIds: [users.premium],
        }),
      ]);

      // Test feature access for each user type
      const testCases = [
        {
          user: users.basic,
          features: [baseFeature],
          deniedFeatures: [advancedFeature, premiumFeature],
        },
        {
          user: users.advanced,
          features: [baseFeature, advancedFeature],
          deniedFeatures: [premiumFeature],
        },
        {
          user: users.premium,
          features: [baseFeature, advancedFeature, premiumFeature],
          deniedFeatures: [],
        },
      ];

      for (const testCase of testCases) {
        // Test allowed features
        for (const feature of testCase.features) {
          reflector.get.mockImplementation((metadataKey: unknown) => {
            if (metadataKey === FEATURE_FLAG_KEY) return [feature];
            return undefined;
          });

          const context = createMockContext(testCase.user);
          const result = await guard.canActivate(context);
          expect(result).toBe(true);
        }

        // Test denied features
        for (const feature of testCase.deniedFeatures) {
          reflector.get.mockImplementation((metadataKey: unknown) => {
            if (metadataKey === FEATURE_FLAG_KEY) return [feature];
            return undefined;
          });

          const context = createMockContext(testCase.user);
          const result = await guard.canActivate(context);
          expect(result).toBe(false);
        }
      }
    });

    it('should handle feature flag cleanup and migration', async () => {
      const oldFlag = 'old_feature';
      const newFlag = 'new_feature';
      const users = ['user1', 'user2', 'user3'];

      // Phase 1: Old feature is active
      await cache.setFeatureFlag({
        flag: oldFlag,
        enabled: true,
        userIds: users,
      });

      // Phase 2: Introduce new feature alongside old one
      await cache.setFeatureFlag({
        flag: newFlag,
        enabled: true,
        userIds: users,
      });

      // Test both features work
      for (const flag of [oldFlag, newFlag]) {
        reflector.get.mockImplementation((metadataKey: unknown) => {
          if (metadataKey === FEATURE_FLAG_KEY) return [flag];
          return undefined;
        });

        for (const userId of users) {
          const context = createMockContext(userId);
          const result = await guard.canActivate(context);
          expect(result).toBe(true);
        }
      }

      // Phase 3: Disable old feature (migration complete)
      await cache.setFeatureFlag({
        flag: oldFlag,
        enabled: false,
      });

      // Test old feature is disabled
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [oldFlag];
        return undefined;
      });

      for (const userId of users) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(false);
      }

      // Test new feature still works
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return [newFlag];
        return undefined;
      });

      for (const userId of users) {
        const context = createMockContext(userId);
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });
  });
});
