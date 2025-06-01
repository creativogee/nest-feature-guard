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

### Basic Installation

```bash
npm install nest-feature-guard
# or
yarn add nest-feature-guard
# or
pnpm add nest-feature-guard
```

### With Redis Support

If you want to use the built-in Redis implementation:

```bash
npm install nest-feature-guard ioredis
# or
yarn add nest-feature-guard ioredis
# or
pnpm add nest-feature-guard ioredis
```

**Note**: `ioredis` is an optional peer dependency. You only need to install it if you plan to use the `RedisFeatureGuardStore`. You can implement custom storage backends using the `FeatureGuardStore` interface without Redis.

## 🏗️ Architecture Overview

The library consists of several key components:

- **FeatureGuard**: The main guard that enforces feature flag access control
- **@FeatureFlag**: Decorator for applying feature flags to routes and methods
- **FeatureGuardStore**: Interface for implementing custom cache backends
- **RedisFeatureGuardStore**: Default Redis implementation
- **FeatureFlagScope**: Enum defining different scopes (CONTROLLER, SERVICE)

## 🚀 Quick Start

### Module Setup

Configure the FeatureGuardModule by choosing your storage backend:

```typescript
import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis'; // Only needed for Redis option
import {
  FeatureGuard,
  RedisFeatureGuardStore, // Only needed for Redis option
  FEATURE_GUARD_STORE,
  FEATURE_GUARD_REFLECTOR,
} from 'nest-feature-guard';
import { YourCustomStore } from './your-custom-store'; // Only needed for Custom option

// Redis setup (skip if using custom store)
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

@Module({
  providers: [
    Reflector,

    // 🔄 CHOOSE ONE: Redis OR Custom Store
    // Option A: Redis (install ioredis first)
    {
      provide: FEATURE_GUARD_STORE,
      useValue: new RedisFeatureGuardStore(redis),
    },

    // Option B: Custom Store (implement FeatureGuardStore interface)
    // YourCustomStore,
    // {
    //   provide: FEATURE_GUARD_STORE,
    //   useExisting: YourCustomStore,
    // },

    // 📌 Always include these
    {
      provide: FEATURE_GUARD_REFLECTOR,
      useExisting: Reflector,
    },
    FeatureGuard,
  ],
  exports: [FeatureGuard, FEATURE_GUARD_STORE, FEATURE_GUARD_REFLECTOR],
})
export class FeatureGuardModule {}
```

**💡 Setup Guide:**

1. **For Redis**: Uncomment Redis provider, comment out Custom provider
2. **For Custom Store**: Uncomment Custom provider, comment out Redis provider
3. **For Custom Store**: See [Custom Store Implementation](#-custom-store-implementation) for example implementations

### Request Interface Setup

Ensure your request interface includes the required fields:

```typescript
import { Request } from 'express';

export interface AppRequest extends Request {
  __user_id?: string;
  __is_admin?: boolean;
  __feature_flags?: Record<string, boolean>;
}
```

### Middleware for User Context

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

  // Multiple feature flags can be applied in a single decorator
  @Post('feedback')
  @FeatureFlag(['beta_access', 'feedback_system'])
  submitBetaFeedback(@Body() feedback: any) {
    return { message: 'Feedback submitted successfully' };
  }
}
```

### Service-Level Feature Detection

Use `SERVICE` scope to detect feature flags without blocking access.

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { FeatureFlag, FeatureFlagScope } from 'nest-feature-guard';
import { AppRequest } from './interfaces/app-request.interface';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @FeatureFlag('enhanced_search', { scope: FeatureFlagScope.SERVICE })
  async getProducts(@Req() request: AppRequest) {
    // request.__feature_flags will be populated with the feature flag states
    return this.productService.getProducts(request);
  }

  @Get('enhanced')
  @FeatureFlag(['enhanced_search', 'ai_recommendations'], { scope: FeatureFlagScope.SERVICE })
  async getEnhancedProducts(@Req() request: AppRequest) {
    // All feature flag states are now available on request.__feature_flags
    return this.productService.getEnhancedProducts(request);
  }
}
```

**Key Points:**

- `SERVICE` scope always allows requests to proceed
- Feature flag states are set on `request.__feature_flags`

### Business Logic Integration

Services handle the actual business logic using feature flags:

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureGuard } from 'nest-feature-guard';
import { AppRequest } from './interfaces/app-request.interface';

@Injectable()
export class ProductService {
  async getProducts(request: AppRequest) {
    const products = await this.fetchBasicProducts();

    // Business logic: Check feature flags and enhance accordingly
    if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
      return this.addEnhancedSearchCapabilities(products);
    }

    return products;
  }

  async getEnhancedProducts(request: AppRequest) {
    let products = await this.fetchBasicProducts();

    // Progressive enhancement based on multiple flags
    if (FeatureGuard.isFeatureEnabled(request, 'enhanced_search')) {
      products = this.addSearchCapabilities(products);
    }

    if (FeatureGuard.isFeatureEnabled(request, 'ai_recommendations')) {
      products = await this.addAIRecommendations(products);
    }

    return products;
  }
}
```

### Advanced Usage Patterns

Complex scenarios, A/B testing, and progressive enhancement:

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

  // A/B testing example
  @Get('experimental')
  @FeatureFlag(['experiment_access'], { scope: FeatureFlagScope.SERVICE })
  async getExperimentalFeature(@Req() request: AppRequest) {
    // Determine which variant to show
    if (FeatureGuard.isFeatureEnabled(request, 'variant_a')) {
      return this.getVariantA();
    }

    if (FeatureGuard.isFeatureEnabled(request, 'variant_b')) {
      return this.getVariantB();
    }

    return this.getDefaultVariant();
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

## 🔌 Custom Store Implementation

Implement your own store backend using the `FeatureGuardStore` interface. Here are examples for different storage strategies:

### In-Memory Store (Development/Testing)

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureGuardStore, SetFeatureFlagOptions } from 'nest-feature-guard';

@Injectable()
export class InMemoryFeatureStore implements FeatureGuardStore {
  private features = new Map<string, { enabled: boolean; userIds?: string[] }>();

  async setFeatureFlag({ flag, enabled, userIds }: SetFeatureFlagOptions): Promise<void> {
    this.features.set(flag, { enabled, userIds });
  }

  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    return this.features.get(flag) || null;
  }

  async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
    const feature = this.features.get(flag);
    if (!feature || !feature.enabled) return false;
    if (!feature.userIds || feature.userIds.length === 0) return true;
    return feature.userIds.includes(userId);
  }
}
```

### Database Store (Production)

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureGuardStore, SetFeatureFlagOptions } from 'nest-feature-guard';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

// TypeORM Entity for feature flags
@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  flag: string;

  @Column({ default: false })
  enabled: boolean;

  @Column('json', { nullable: true })
  userIds: string[] | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

@Injectable()
export class DatabaseFeatureStore implements FeatureGuardStore {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepository: Repository<FeatureFlag>,
  ) {}

  async setFeatureFlag({ flag, enabled, userIds }: SetFeatureFlagOptions): Promise<void> {
    await this.featureFlagRepository.upsert(
      {
        flag,
        enabled,
        userIds: userIds || null,
      },
      ['flag'], // conflict target
    );
  }

  async getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null> {
    const feature = await this.featureFlagRepository.findOne({ where: { flag } });

    if (!feature) return null;

    return {
      enabled: feature.enabled,
      userIds: feature.userIds || undefined,
    };
  }

  async hasFeatureFlag(flag: string, userId: string): Promise<boolean> {
    const feature = await this.featureFlagRepository.findOne({ where: { flag } });

    if (!feature || !feature.enabled) return false;
    if (!feature.userIds || feature.userIds.length === 0) return true;

    return feature.userIds.includes(userId);
  }
}

// Module setup with Database Store
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag])],
  providers: [
    Reflector,
    DatabaseFeatureStore,
    {
      provide: FEATURE_GUARD_STORE,
      useExisting: DatabaseFeatureStore,
    },
    {
      provide: FEATURE_GUARD_REFLECTOR,
      useExisting: Reflector,
    },
    FeatureGuard,
  ],
  exports: [FeatureGuard, FEATURE_GUARD_STORE, FEATURE_GUARD_REFLECTOR, DatabaseFeatureStore],
})
export class FeatureGuardDatabaseModule {}
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
FeatureFlag(flags: string | string[], options?: FeatureFlagOptions): MethodDecorator
```

#### Parameters

- `flags`: The feature flag identifier(s) - can be a single string or an array of strings
- `options`: Optional configuration object
  - `scope`: `FeatureFlagScope.CONTROLLER` (default) or `FeatureFlagScope.SERVICE`

#### Behavior

When multiple flags are provided (either as an array or multiple decorators):

- **CONTROLLER scope**: ALL flags must be enabled and the user must have access to ALL flags
- **SERVICE scope**: All flags are evaluated and their states are set on the request object

#### Examples

```typescript
// Single flag
@FeatureFlag('beta_access')

// Multiple flags in array (ALL must be satisfied)
@FeatureFlag(['beta_access', 'feedback_system'])

// Multiple decorators (ALL must be satisfied)
@FeatureFlag('beta_access')
@FeatureFlag('feedback_system')

// Service scope with multiple flags
@FeatureFlag(['enhanced_search', 'ai_recommendations'], { scope: FeatureFlagScope.SERVICE })
```

### FeatureGuardStore Interface

#### Methods

- `setFeatureFlag(options: SetFeatureFlagOptions): Promise<void>`
- `getFeature(flag: string): Promise<{ enabled: boolean; userIds?: string[] } | null>`
- `hasFeatureFlag(flag: string, userId: string): Promise<boolean>`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the NestJS ecosystem
- Inspired by modern feature flag management best practices
- Thanks to all users!
