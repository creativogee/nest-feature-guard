<h1 align="center">
  nest-feature-guard
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/nest-feature-guard"><img alt="NPM version" src="https://img.shields.io/npm/v/nest-feature-guard.svg"></a>
  <a href="https://www.npmjs.com/package/nest-feature-guard"><img alt="NPM downloads" src="https://img.shields.io/npm/dw/nest-feature-guard.svg"></a>
  <a href="https://www.paypal.com/donate?hosted_button_id=Z9NGDEGSC3LPY" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"></a>
</p>

A powerful, NestJS-first feature flag guard and decorator library that provides fine-grained access control with Redis caching support. Perfect for implementing feature toggles, A/B testing, gradual rollouts, and user-specific feature access.

## 🚀 Features

- **NestJS Integration**: First-class support for NestJS with decorators and guards
- **Flexible Access Control**: Support for user-specific, role-based, and global feature flags
- **Multiple Scopes**: Controller-level access control and service-level feature detection
- **Redis Caching**: High-performance Redis backend with customizable key prefixes
- **Pluggable Architecture**: Implement custom cache backends via the `FeatureGuardStore` interface
- **TypeScript Support**: Full TypeScript support with comprehensive type definitions
- **Admin Override**: Automatic admin user bypass for all feature flags
- **Request Enhancement**: Automatic feature flag state injection into request objects

## 📦 Installation

```bash
npm install nest-feature-guard ioredis
# or
yarn add nest-feature-guard ioredis
# or
pnpm add nest-feature-guard ioredis
```

## 🏗️ Architecture Overview

The library consists of several key components:

- **FeatureGuard**: The main guard that enforces feature flag access control
- **@FeatureFlag**: Decorator for applying feature flags to routes and methods
- **FeatureGuardStore**: Interface for implementing custom cache backends
- **RedisFeatureGuardStore**: Default Redis implementation
- **FeatureFlagScope**: Enum defining different scopes (CONTROLLER, SERVICE)

## 🚀 Quick Start

### 1. Basic Setup with Redis

```typescript
import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import {
  FeatureGuard,
  RedisFeatureGuardStore,
  FEATURE_GUARD_STORE,
  FEATURE_GUARD_REFLECTOR,
} from 'nest-feature-guard';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

const featureGuardStore = new RedisFeatureGuardStore(redis);

@Module({
  providers: [
    Reflector,
    {
      provide: FEATURE_GUARD_STORE,
      useValue: featureGuardStore,
    },
    {
      provide: FEATURE_GUARD_REFLECTOR,
      useExisting: Reflector,
    },
    {
      provide: FeatureGuard,
      useFactory: (reflector: Reflector, store: RedisFeatureGuardStore) => {
        return new FeatureGuard(store, reflector);
      },
      inject: [FEATURE_GUARD_REFLECTOR, FEATURE_GUARD_STORE],
    },
  ],
  exports: [FeatureGuard, FEATURE_GUARD_STORE, FEATURE_GUARD_REFLECTOR],
})
export class FeatureGuardModule {}
```

### 2. Request Interface Setup

Ensure your request interface includes the required fields:

```typescript
import { Request } from 'express';

export interface AppRequest extends Request {
  __user_id?: string;
  __is_admin?: boolean;
  __feature_flags?: Record<string, boolean>;
}
```

### 3. Middleware for User Context

Set up middleware to populate user information:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AppRequest } from './interfaces/app-request.interface';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  async use(req: AppRequest, res: Response, next: NextFunction) {
    // Extract user information from JWT, session, etc.
    const user = await this.extractUserFromToken(req);

    req.__user_id = user?.id;
    req.__is_admin = user?.isAdmin || false;
    req.__feature_flags = {};

    next();
  }
}
```

## 🎯 Usage Examples

### Controller-Level Access Control

Use `@FeatureFlag` to protect entire routes:

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { FeatureFlag, FeatureFlagScope } from 'nest-feature-guard';

@Controller('beta')
export class BetaController {
  // Only users with 'beta_access' flag can access this endpoint
  @Get('dashboard')
  @FeatureFlag('beta_access')
  getBetaDashboard() {
    return { message: 'Welcome to the beta dashboard!' };
  }

  // Multiple feature flags can be applied
  @Post('feedback')
  @FeatureFlag('beta_access')
  @FeatureFlag('feedback_system')
  submitBetaFeedback(@Body() feedback: any) {
    return { message: 'Feedback submitted successfully' };
  }
}
```

### Service-Level Feature Detection

Use `SERVICE` scope to detect feature flags without blocking access:

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { FeatureFlag, FeatureFlagScope, FeatureGuard } from 'nest-feature-guard';
import { AppRequest } from './interfaces/app-request.interface';

@Controller('products')
export class ProductController {
  @Get()
  @FeatureFlag('enhanced_search', { scope: FeatureFlagScope.SERVICE })
  async getProducts(@Req() request: AppRequest) {
    const products = await this.productService.getProducts();

    // Check if enhanced search is enabled for this user
    if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
      // Add enhanced search capabilities
      return this.productService.getProductsWithEnhancedSearch();
    }

    return products;
  }
}
```

### Business Logic Integration

Use feature flags within your services:

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureGuard } from 'nest-feature-guard';
import { AppRequest } from './interfaces/app-request.interface';

@Injectable()
export class NotificationService {
  async sendNotification(request: AppRequest, message: string) {
    // Check for email notifications feature
    if (FeatureGuard.isFeatureEnabled(request, 'email_notifications')) {
      await this.sendEmailNotification(message);
    }

    // Check for push notifications feature
    if (FeatureGuard.isFeatureEnabled(request, 'push_notifications')) {
      await this.sendPushNotification(message);
    }

    // Fallback to basic notification
    await this.sendBasicNotification(message);
  }
}
```

### Advanced Feature Flag Combinations

```typescript
@Controller('analytics')
export class AnalyticsController {
  @Get('dashboard')
  @FeatureFlag('analytics_access')
  async getDashboard(@Req() request: AppRequest) {
    const basicData = await this.getBasicAnalytics();

    // Progressive feature enhancement
    if (FeatureGuard.isFeatureEnabled(request, 'advanced_charts')) {
      basicData.charts = await this.getAdvancedCharts();
    }

    if (FeatureGuard.isFeatureEnabled(request, 'real_time_data')) {
      basicData.realTime = await this.getRealTimeData();
    }

    if (FeatureGuard.isFeatureEnabled(request, 'export_functionality')) {
      basicData.exportOptions = this.getExportOptions();
    }

    return basicData;
  }
}
```

## 🔧 Feature Flag Management

### Setting Feature Flags

```typescript
import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { FEATURE_GUARD_STORE, FeatureGuardStore } from 'nest-feature-guard';

@Injectable()
export class FeatureManagementService {
  constructor(
    @Inject(FEATURE_GUARD_STORE)
    private readonly store: FeatureGuardStore,
  ) {}

  // Enable feature for specific users
  async enableFeatureForUsers(flag: string, userIds: string[]) {
    await this.store.setFeatureFlag({
      flag,
      enabled: true,
      userIds,
    });
  }

  // Enable feature globally
  async enableFeatureGlobally(flag: string) {
    await this.store.setFeatureFlag({
      flag,
      enabled: true,
      // No userIds = global access
    });
  }

  // Disable feature (when disabled, no one has access regardless of userIds)
  async disableFeature(flag: string) {
    await this.store.setFeatureFlag({
      flag,
      enabled: false,
    });
  }
}
```

### Feature Flag Behavior Matrix

| `enabled` | `userIds`              | Behavior                                             |
| --------- | ---------------------- | ---------------------------------------------------- |
| `true`    | `[]` (empty/undefined) | **Global Access**: Everyone has access               |
| `true`    | `['user1', 'user2']`   | **Targeted Access**: Only listed users have access   |
| `false`   | `[]` (empty/undefined) | **Global Deny**: No one has access                   |
| `false`   | `['user1', 'user2']`   | **Global Deny**: No one has access (userIds ignored) |

### Dynamic Feature Flag Updates

```typescript
@Injectable()
export class FeatureRolloutService {
  constructor(
    @Inject(FEATURE_GUARD_STORE)
    private readonly store: FeatureGuardStore,
  ) {}

  // Gradual rollout: start with 10% of users
  async startGradualRollout(flag: string, allUserIds: string[], percentage: number = 10) {
    const sampleSize = Math.floor(allUserIds.length * (percentage / 100));
    const selectedUsers = allUserIds.slice(0, sampleSize);

    await this.store.setFeatureFlag({
      flag,
      enabled: true,
      userIds: selectedUsers,
    });
  }

  // A/B testing setup
  async setupABTest(flagA: string, flagB: string, userIds: string[]) {
    const midpoint = Math.floor(userIds.length / 2);
    const groupA = userIds.slice(0, midpoint);
    const groupB = userIds.slice(midpoint);

    await Promise.all([
      this.store.setFeatureFlag({ flag: flagA, enabled: true, userIds: groupA }),
      this.store.setFeatureFlag({ flag: flagB, enabled: true, userIds: groupB }),
    ]);
  }
}
```

## 🏢 Enterprise Integration Example

Here's how the library is used in a real enterprise application:

```typescript
// feature-guard.module.ts
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_GUARD_REFLECTOR, FEATURE_GUARD_STORE, FeatureGuard } from 'nest-feature-guard';
import { CacheService } from '../cache/cache.service';

@Global()
@Module({
  providers: [
    Reflector,
    {
      provide: FEATURE_GUARD_STORE,
      useExisting: CacheService, // Custom cache implementation
    },
    {
      provide: FEATURE_GUARD_REFLECTOR,
      useExisting: Reflector,
    },
    {
      provide: FeatureGuard,
      useFactory: (reflector: Reflector, store: CacheService) => {
        return new FeatureGuard(store, reflector);
      },
      inject: [FEATURE_GUARD_REFLECTOR, FEATURE_GUARD_STORE],
    },
  ],
  exports: [FeatureGuard, FEATURE_GUARD_STORE, FEATURE_GUARD_REFLECTOR],
})
export class FeatureGuardModule {}

// Custom store service implementation
@Injectable()
export class CacheService implements FeatureGuardStore {
  constructor(private readonly redis: Redis) {}

  async setFeatureFlag({ flag, enabled, userIds }: SetFeatureFlagOptions) {
    const featureKey = `company:feature-flags:${flag}`;
    const featureInfoKey = `${featureKey}:info`;
    const featureUsersKey = `${featureKey}:users`;

    const pipeline = this.redis.pipeline();
    pipeline.hmset(featureInfoKey, { flag, enabled });

    if (userIds?.length) {
      userIds.forEach((userId) => {
        pipeline.sadd(featureUsersKey, userId);
      });
    }

    await pipeline.exec();
  }

  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    const featureInfoKey = `company:feature-flags:${flag}:info`;
    const featureInfo = await this.redis.hgetall(featureInfoKey);

    if (!featureInfo) return null;

    return {
      enabled: Boolean(featureInfo.enabled),
      userIds: featureInfo.userIds ? [featureInfo.userIds] : undefined,
    };
  }

  async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
    const featureInfoKey = `company:feature-flags:${flag}:info`;
    const featureUsersKey = `company:feature-flags:${flag}:users`;

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
```

## 🔌 Custom Store Implementation

Implement your own store backend:

```typescript
import { FeatureGuardStore, SetFeatureFlagOptions } from 'nest-feature-guard';

@Injectable()
export class DatabaseFeatureFlagStore implements FeatureGuardStore {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepo: Repository<FeatureFlag>,
  ) {}

  async setFeatureFlag({ flag, enabled, userIds }: SetFeatureFlagOptions): Promise<void> {
    const feature = await this.featureFlagRepo.findOne({ where: { name: flag } });

    if (feature) {
      feature.enabled = enabled;
      feature.userIds = userIds || [];
      await this.featureFlagRepo.save(feature);
    } else {
      await this.featureFlagRepo.save({
        name: flag,
        enabled,
        userIds: userIds || [],
      });
    }
  }

  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    const feature = await this.featureFlagRepo.findOne({ where: { name: flag } });
    return feature ? { enabled: feature.enabled, userIds: feature.userIds } : null;
  }

  async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
    const feature = await this.featureFlagRepo.findOne({ where: { name: flag } });
    if (!feature) return false;

    // If feature is disabled, no one has access
    if (!feature.enabled) {
      return false;
    }

    const hasUsers = feature.userIds && feature.userIds.length > 0;

    // For global features (no users list), everyone has access
    if (!hasUsers) {
      return true;
    }

    // For targeted features, only users in the list have access
    const isUserInList = feature.userIds.includes(userId);
    return isUserInList;
  }
}
```

## 🧪 Testing

### Unit Testing Feature Guards

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGuard, FeatureGuardStore } from 'nest-feature-guard';

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let store: jest.Mocked<FeatureGuardStore>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const mockStore = {
      getFeature: jest.fn(),
      hasFeatureFlag: jest.fn(),
      setFeatureFlag: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        { provide: 'FeatureGuardStore', useValue: mockStore },
        { provide: 'FeatureGuardReflector', useValue: { get: jest.fn() } },
      ],
    }).compile();

    guard = module.get<FeatureGuard>(FeatureGuard);
    store = module.get('FeatureGuardStore');
    reflector = module.get('FeatureGuardReflector');
  });

  it('should allow access when feature is enabled and user has flag', async () => {
    const mockContext = createMockExecutionContext({
      __user_id: 'test-user',
      __is_admin: false,
    });

    reflector.get.mockReturnValue('test_feature');
    store.getFeature.mockResolvedValue({ enabled: true });
    store.hasFeatureFlag.mockResolvedValue(true);

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
```

### Integration Testing

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { FeatureGuardModule } from './feature-guard.module';

describe('Feature Flag Integration', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FeatureGuardModule, TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should deny access when feature is disabled', () => {
    return request(app.getHttpServer())
      .get('/beta/dashboard')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);
  });

  it('should allow access when feature is enabled', async () => {
    // Enable feature for test user
    await featureStore.setFeatureFlag({
      flag: 'beta_access',
      enabled: true,
      userIds: ['test-user-id'],
    });

    return request(app.getHttpServer())
      .get('/beta/dashboard')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
  });
});
```

## 📊 Monitoring and Analytics

### Feature Flag Usage Tracking

```typescript
@Injectable()
export class FeatureAnalyticsService {
  constructor(
    @Inject(FEATURE_GUARD_STORE)
    private readonly store: FeatureGuardStore,
  ) {}

  async trackFeatureUsage(flag: string, userId: string, used: boolean) {
    // Track feature flag usage for analytics
    await this.analyticsService.track({
      event: 'feature_flag_checked',
      userId,
      properties: {
        flag,
        used,
        timestamp: new Date(),
      },
    });
  }

  async getFeatureUsageStats(flag: string): Promise<FeatureUsageStats> {
    // Implementation for getting usage statistics
    return this.analyticsService.getFeatureStats(flag);
  }
}
```

## 🔒 Security Considerations

### Admin Override Protection

```typescript
@Injectable()
export class SecureFeatureGuard extends FeatureGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Log admin overrides for security auditing
    if (request.__is_admin) {
      await this.auditService.logAdminOverride({
        userId: request.__user_id,
        endpoint: request.url,
        timestamp: new Date(),
      });
    }

    return super.canActivate(context);
  }
}
```

### Rate Limiting for Feature Flags

```typescript
@Injectable()
export class RateLimitedFeatureGuard extends FeatureGuard {
  constructor(
    store: FeatureGuardStore,
    reflector: Reflector,
    private readonly rateLimiter: RateLimiterService,
  ) {
    super(store, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Apply rate limiting to feature flag checks
    await this.rateLimiter.checkLimit(
      `feature-check:${request.__user_id}`,
      100, // 100 checks per minute
      60, // 1 minute window
    );

    return super.canActivate(context);
  }
}
```

## 🌐 Frontend Integration

### Feature Flag API for Frontend Access Management

The library can be extended to provide feature flags to frontend applications for client-side route protection and UI feature toggling.

```typescript
import { Controller, Get, Query, Req } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { FEATURE_GUARD_STORE, FeatureGuardStore } from 'nest-feature-guard';

export interface GetFeatureFlagsQuery {
  userId?: string;
  includeInternal?: boolean; // Whether to include internal/admin-only flags
}

export interface FeatureFlagResponse {
  flag: string;
  enabled: boolean;
  hasAccess: boolean;
  scope: 'public' | 'user' | 'admin';
}

@Controller('api/feature-flags')
export class FeatureFlagsController {
  constructor(
    @Inject(FEATURE_GUARD_STORE)
    private readonly store: FeatureGuardStore,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  /**
   * Get all feature flags accessible to the current user
   * This endpoint is used by frontend applications for route protection and UI features
   */
  @Get()
  async getFeatureFlags(
    @Query() query: GetFeatureFlagsQuery,
    @Req() request: any,
  ): Promise<Record<string, boolean>> {
    const userId = query.userId || request.__user_id || 'anonymous';
    const isAdmin = request.__is_admin === true;

    // Get all configured feature flags
    const allFlags = await this.featureFlagService.getAllFlags();
    const result: Record<string, boolean> = {};

    for (const flagConfig of allFlags) {
      const { flag, enabled, visibility } = flagConfig;

      // Check if user has access to this specific flag
      const hasUserAccess = await this.store.hasFeatureFlag(flag, userId);

      // Determine final access based on visibility and user permissions
      let hasAccess = false;

      if (isAdmin) {
        // Admins have access to all enabled flags
        hasAccess = enabled;
      } else if (visibility === 'public') {
        // Public flags: enabled globally or user has specific access
        hasAccess = enabled && (hasUserAccess || !flagConfig.userIds?.length);
      } else if (visibility === 'user') {
        // User-specific flags: only if user has explicit access
        hasAccess = enabled && hasUserAccess;
      }
      // 'admin' visibility flags are not included for non-admin users

      if (query.includeInternal || visibility !== 'admin') {
        result[flag] = hasAccess;
      }
    }

    return result;
  }

  /**
   * Get detailed feature flag information (for admin dashboards)
   */
  @Get('detailed')
  async getDetailedFeatureFlags(@Req() request: any): Promise<FeatureFlagResponse[]> {
    const userId = request.__user_id;
    const isAdmin = request.__is_admin === true;

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    const allFlags = await this.featureFlagService.getAllFlags();
    const result: FeatureFlagResponse[] = [];

    for (const flagConfig of allFlags) {
      const hasUserAccess = userId
        ? await this.store.hasFeatureFlag(flagConfig.flag, userId)
        : false;

      result.push({
        flag: flagConfig.flag,
        enabled: flagConfig.enabled,
        hasAccess: hasUserAccess,
        scope: flagConfig.visibility,
      });
    }

    return result;
  }
}

@Injectable()
export class FeatureFlagService {
  constructor(
    @Inject(FEATURE_GUARD_STORE)
    private readonly store: FeatureGuardStore,
  ) {}

  async getAllFlags(): Promise<
    Array<{
      flag: string;
      enabled: boolean;
      visibility: 'public' | 'user' | 'admin';
      userIds?: string[];
    }>
  > {
    // This would typically come from your database or configuration
    // Here's a simplified example - implement based on your storage strategy
    return [
      { flag: 'new_dashboard', enabled: true, visibility: 'public' },
      { flag: 'beta_features', enabled: true, visibility: 'user', userIds: ['beta_user1'] },
      { flag: 'admin_panel', enabled: true, visibility: 'admin' },
      { flag: 'experimental_ui', enabled: false, visibility: 'user' },
    ];
  }
}
```

### Frontend Usage Examples

#### React Route Protection

```typescript
// hooks/useFeatureFlags.ts
import { useEffect, useState } from 'react';

interface FeatureFlags {
  [key: string]: boolean;
}

export function useFeatureFlags(userId?: string): {
  flags: FeatureFlags;
  loading: boolean;
  error: Error | null;
} {
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchFlags() {
      try {
        setLoading(true);
        const params = userId ? `?userId=${userId}` : '';
        const response = await fetch(`/api/feature-flags${params}`);

        if (!response.ok) {
          throw new Error('Failed to fetch feature flags');
        }

        const data = await response.json();
        setFlags(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchFlags();
  }, [userId]);

  return { flags, loading, error };
}

// components/ProtectedRoute.tsx
import React from 'react';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

interface ProtectedRouteProps {
  featureFlag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  userId?: string;
}

export function ProtectedRoute({
  featureFlag,
  children,
  fallback = null,
  userId,
}: ProtectedRouteProps) {
  const { flags, loading } = useFeatureFlags(userId);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!flags[featureFlag]) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// App.tsx - Usage example
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  const userId = getCurrentUserId(); // Your auth logic

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<HomePage />} />

        {/* Protected beta dashboard */}
        <Route
          path='/beta'
          element={
            <ProtectedRoute
              featureFlag='beta_dashboard'
              userId={userId}
              fallback={<div>Beta access required</div>}
            >
              <BetaDashboard />
            </ProtectedRoute>
          }
        />

        {/* Admin-only routes */}
        <Route
          path='/admin'
          element={
            <ProtectedRoute
              featureFlag='admin_panel'
              userId={userId}
              fallback={<div>Admin access required</div>}
            >
              <AdminPanel />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

#### Vue.js Integration

```typescript
// composables/useFeatureFlags.ts
import { ref, onMounted } from 'vue';

export function useFeatureFlags(userId?: string) {
  const flags = ref<Record<string, boolean>>({});
  const loading = ref(true);
  const error = ref<Error | null>(null);

  const fetchFlags = async () => {
    try {
      loading.value = true;
      const params = userId ? `?userId=${userId}` : '';
      const response = await fetch(`/api/feature-flags${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch feature flags');
      }

      flags.value = await response.json();
    } catch (err) {
      error.value = err as Error;
    } finally {
      loading.value = false;
    }
  };

  onMounted(fetchFlags);

  return { flags, loading, error, refetch: fetchFlags };
}

// components/FeatureGate.vue
<template>
  <div v-if="!loading">
    <slot v-if="hasAccess" />
    <slot v-else name="fallback" />
  </div>
  <div v-else>Loading...</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFeatureFlags } from '../composables/useFeatureFlags';

interface Props {
  flag: string;
  userId?: string;
}

const props = defineProps<Props>();
const { flags, loading } = useFeatureFlags(props.userId);

const hasAccess = computed(() => flags.value[props.flag] === true);
</script>

// Usage in components
<template>
  <div>
    <h1>Dashboard</h1>

    <FeatureGate flag="new_analytics" :userId="currentUser.id">
      <NewAnalyticsWidget />
      <template #fallback>
        <LegacyAnalyticsWidget />
      </template>
    </FeatureGate>

    <FeatureGate flag="beta_features" :userId="currentUser.id">
      <BetaFeaturesPanel />
    </FeatureGate>
  </div>
</template>
```

#### Angular Service

```typescript
// services/feature-flag.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class FeatureFlagService {
  private flagsSubject = new BehaviorSubject<Record<string, boolean>>({});
  public flags$ = this.flagsSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadFlags(userId?: string): Observable<Record<string, boolean>> {
    const params = userId ? { userId } : {};

    return this.http.get<Record<string, boolean>>('/api/feature-flags', { params }).pipe(
      map((flags) => {
        this.flagsSubject.next(flags);
        return flags;
      }),
      catchError((error) => {
        console.error('Failed to load feature flags:', error);
        return this.flagsSubject.asObservable();
      }),
    );
  }

  isEnabled(flag: string): Observable<boolean> {
    return this.flags$.pipe(map((flags) => flags[flag] === true));
  }

  isEnabledSync(flag: string): boolean {
    return this.flagsSubject.value[flag] === true;
  }
}

// guards/feature-flag.guard.ts
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeatureFlagService } from '../services/feature-flag.service';

@Injectable({
  providedIn: 'root',
})
export class FeatureFlagGuard implements CanActivate {
  constructor(private featureFlagService: FeatureFlagService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const requiredFlag = route.data['featureFlag'];

    if (!requiredFlag) {
      return new Observable((observer) => observer.next(true));
    }

    return this.featureFlagService.isEnabled(requiredFlag).pipe(
      map((enabled) => {
        if (!enabled) {
          this.router.navigate(['/access-denied']);
          return false;
        }
        return true;
      }),
    );
  }
}

// app-routing.module.ts
const routes: Routes = [
  {
    path: 'beta',
    component: BetaDashboardComponent,
    canActivate: [FeatureFlagGuard],
    data: { featureFlag: 'beta_dashboard' },
  },
  {
    path: 'admin',
    component: AdminPanelComponent,
    canActivate: [FeatureFlagGuard],
    data: { featureFlag: 'admin_panel' },
  },
];
```

### Security Considerations for Frontend Integration

```typescript
// Middleware to ensure secure feature flag exposure
@Injectable()
export class FeatureFlagSecurityMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    // Rate limiting for feature flag requests
    // Audit logging for sensitive flag access
    // User context validation
    next();
  }
}

// Enhanced controller with security
@Controller('api/feature-flags')
@UseGuards(AuthGuard, RateLimitGuard)
export class SecureFeatureFlagsController {
  @Get()
  @UseInterceptors(CacheInterceptor) // Cache responses for performance
  async getFeatureFlags(@Req() request: AuthenticatedRequest) {
    // Validate user context
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Log access for audit trail
    this.auditService.logFeatureFlagAccess({
      userId: request.user.id,
      timestamp: new Date(),
      endpoint: 'getFeatureFlags',
    });

    // Return flags with security filtering
    return this.getFilteredFlags(request.user);
  }

  private async getFilteredFlags(user: User): Promise<Record<string, boolean>> {
    // Implementation that filters sensitive flags based on user permissions
    // and applies additional security rules
  }
}
```

## 🚀 Performance Optimization

### Caching Strategies

```typescript
@Injectable()
export class OptimizedFeatureFlagStore implements FeatureGuardStore {
  private readonly localCache = new Map<string, any>();
  private readonly cacheTTL = 60000; // 1 minute

  constructor(private readonly redis: Redis) {}

  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    // Check local cache first
    const cacheKey = `feature:${flag}`;
    const cached = this.localCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Fallback to Redis
    const result = await this.getFeatureFromRedis(flag);

    // Cache locally
    this.localCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  }
}
```

## 📚 API Reference

### FeatureGuard Class

#### Methods

- `canActivate(context: ExecutionContext): Promise<boolean>`

  - Main guard method that determines access based on feature flags
  - Returns `true` if access is granted, `false` otherwise

- `static isFeatureEnabled(request: FeatureGuardRequest, flag: string): boolean`
  - Utility method to check feature flag status in business logic
  - Returns `true` if the feature is enabled for the current request

### @FeatureFlag Decorator

#### Signature

```typescript
FeatureFlag(flag: string, options?: FeatureFlagOptions): MethodDecorator
```

#### Parameters

- `flag`: The feature flag identifier (string)
- `options`: Optional configuration object
  - `scope`: `FeatureFlagScope.CONTROLLER` (default) or `FeatureFlagScope.SERVICE`

### FeatureGuardStore Interface

#### Methods

- `setFeatureFlag(options: SetFeatureFlagOptions): Promise<void>`
- `getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null>`
- `hasFeatureFlag(flag: string, userId: string): Promise<boolean>`

### Redis Key Structure

The Redis implementation uses the following key structure:

```
{prefix}:{flag}:info     # Hash containing feature metadata
{prefix}:{flag}:users    # Set containing user IDs with access
```

Default prefix: `crudmates:feature-guard`

Example keys:

```
crudmates:feature-guard:beta_feature:info
crudmates:feature-guard:beta_feature:users
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ for the ever-growing NestJS community
- Inspired by modern feature flag management needs

---

**Made with ❤️ by [Gbenga Omowole](https://github.com/creativogee)**
