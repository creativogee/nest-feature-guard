import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGuardStore } from '../src/feature-flag-cache.interface';
import {
  FEATURE_FLAG_KEY,
  FEATURE_FLAG_OPTIONS_KEY,
  FeatureFlagScope,
} from '../src/feature-flag.constants';
import { FeatureGuard } from '../src/feature-guard';

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let cache: jest.Mocked<FeatureGuardStore>;
  let reflector: jest.Mocked<Reflector>;
  let context: ExecutionContext;

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
  });

  describe('canActivate', () => {
    it('should deny access when no userId and not admin', async () => {
      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        __user_id: undefined,
        __is_admin: false,
        __feature_flags: {},
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow access when user is admin', async () => {
      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        __user_id: undefined,
        __is_admin: true,
        __feature_flags: {},
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access when no feature flag is set', async () => {
      reflector.get.mockReturnValue(undefined);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should deny access when feature is disabled', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: false });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should deny access when user does not have flag', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(false);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow access when feature is enabled and user has flag', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should set feature flag on request for SERVICE scope', async () => {
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

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.__feature_flags[flag]).toBe(true);
    });

    it('should set feature flag on request for SERVICE scope even when disabled', async () => {
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

      cache.getFeature.mockResolvedValue({ enabled: false });
      cache.hasFeatureFlag.mockResolvedValue(false);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.__feature_flags[flag]).toBe(false);
    });

    // Additional edge case tests
    it('should handle when feature is null', async () => {
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

    it('should handle when userId is null but hasFeatureFlag is called', async () => {
      const flag = 'test_feature';
      const request = {
        __user_id: null,
        __is_admin: false,
        __feature_flags: {},
      };

      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue(request);
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(false);

      const result = await guard.canActivate(context);
      expect(result).toBe(false);
      // With our updated logic, hasFeatureFlag is called with null userId
      expect(cache.hasFeatureFlag).toHaveBeenCalledWith(flag, null);
    });

    it('should preserve existing feature flags on request', async () => {
      const flag = 'test_feature';
      const request = {
        __user_id: 'test-user',
        __is_admin: false,
        __feature_flags: { existing_flag: true },
      };

      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue(request);
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.SERVICE };
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.__feature_flags).toEqual({
        existing_flag: true,
        test_feature: true,
      });
    });

    it('should handle explicit CONTROLLER scope', async () => {
      const flag = 'test_feature';
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        if (metadataKey === FEATURE_FLAG_OPTIONS_KEY) return { scope: FeatureFlagScope.CONTROLLER };
        return undefined;
      });

      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle admin user with feature flag processing', async () => {
      const flag = 'test_feature';
      const request = {
        __user_id: undefined, // No userId but admin
        __is_admin: true,
        __feature_flags: {},
      };

      (context.switchToHttp().getRequest as jest.Mock).mockReturnValue(request);
      reflector.get.mockImplementation((metadataKey: unknown) => {
        if (metadataKey === FEATURE_FLAG_KEY) return flag;
        return undefined;
      });

      // Even though admin bypasses, we still process the feature flag
      cache.getFeature.mockResolvedValue({ enabled: true });
      cache.hasFeatureFlag.mockResolvedValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      // Admin should bypass before feature flag processing
      expect(cache.getFeature).not.toHaveBeenCalled();
      expect(cache.hasFeatureFlag).not.toHaveBeenCalled();
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true when feature flag is enabled', () => {
      const request = {
        __feature_flags: {
          test_feature: true,
        },
      };

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(true);
    });

    it('should return false when feature flag is disabled', () => {
      const request = {
        __feature_flags: {
          test_feature: false,
        },
      };

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(false);
    });

    it('should return false when feature flag is not set', () => {
      const request = {
        __feature_flags: {},
      };

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(false);
    });

    it('should return false when featureFlags is not set', () => {
      const request = {};

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(false);
    });

    it('should return false when featureFlags is null', () => {
      const request = {
        __feature_flags: null as any,
      };

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(false);
    });

    it('should return false when feature flag value is not boolean true', () => {
      const request = {
        __feature_flags: {
          test_feature: 'true' as any, // string instead of boolean
        },
      };

      const result = FeatureGuard.isFeatureEnabled(request, 'test_feature');
      expect(result).toBe(false);
    });
  });
});
