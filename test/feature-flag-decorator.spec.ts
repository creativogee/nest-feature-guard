import { SetMetadata, UseGuards } from '@nestjs/common';
import {
  FEATURE_FLAG_KEY,
  FEATURE_FLAG_OPTIONS_KEY,
  FeatureFlagScope,
} from '../src/feature-flag.constants';
import { FeatureFlag } from '../src/feature-guard';

// Mock the NestJS decorators
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  applyDecorators: jest.fn((...decorators) => decorators),
  SetMetadata: jest.fn(),
  UseGuards: jest.fn(),
}));

describe('FeatureFlag Decorator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create decorator with flag name only', () => {
    const flag = 'test_feature';

    FeatureFlag(flag);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [flag]);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, undefined);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should create decorator with flag name and options', () => {
    const flag = 'test_feature';
    const options = { scope: FeatureFlagScope.SERVICE };

    FeatureFlag(flag, options);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [flag]);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, options);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should create decorator with CONTROLLER scope', () => {
    const flag = 'controller_feature';
    const options = { scope: FeatureFlagScope.CONTROLLER };

    FeatureFlag(flag, options);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [flag]);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, options);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should create decorator with SERVICE scope', () => {
    const flag = 'service_feature';
    const options = { scope: FeatureFlagScope.SERVICE };

    FeatureFlag(flag, options);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [flag]);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, options);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should create decorator with array of flags', () => {
    const flags = ['feature1', 'feature2', 'feature3'];

    FeatureFlag(flags);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, flags);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, undefined);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should create decorator with array of flags and options', () => {
    const flags = ['feature1', 'feature2'];
    const options = { scope: FeatureFlagScope.SERVICE };

    FeatureFlag(flags, options);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, flags);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, options);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should handle empty array', () => {
    const flags: string[] = [];

    FeatureFlag(flags);

    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_KEY, flags);
    expect(SetMetadata).toHaveBeenCalledWith(FEATURE_FLAG_OPTIONS_KEY, undefined);
    expect(UseGuards).toHaveBeenCalled();
  });

  it('should handle single element array same as string', () => {
    const flag = 'single_feature';

    FeatureFlag(flag);
    const stringCall = (SetMetadata as jest.Mock).mock.calls;

    jest.clearAllMocks();

    FeatureFlag([flag]);
    const arrayCall = (SetMetadata as jest.Mock).mock.calls;

    // Both should result in the same metadata
    expect(stringCall[0]).toEqual(arrayCall[0]); // FEATURE_FLAG_KEY calls should be identical
  });
});
