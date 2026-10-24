import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { getFocusAvailability } from '../src/focus/availability';
import { GoalieFocus, isNativeModuleAvailable } from '../src/focus/GoalieFocus';
import { AuthorizationStatus, FocusUnavailableReason } from '../src/focus/types';

// Control the synchronous platform guards (Device) and the native module layer.
// The mock exposes writable `isDevice` / `osVersion` so each test can relax one guard.
jest.mock('expo-device', () => ({
  __esModule: true,
  isDevice: true,
  osVersion: '18.5',
}));

jest.mock('../src/focus/GoalieFocus', () => ({
  __esModule: true,
  isNativeModuleAvailable: jest.fn(() => true),
  GoalieFocus: {
    getAuthorizationStatus: jest.fn(),
  },
}));

// The mock above makes these properties writable at runtime.
const mutableDevice = Device as { isDevice: boolean; osVersion: string | null };

const mockIsNativeModuleAvailable = isNativeModuleAvailable as jest.Mock;
const mockGetAuthorizationStatus = GoalieFocus.getAuthorizationStatus as jest.Mock;

function setPlatform(os: string): void {
  // Platform.OS is readonly in types; override at runtime for the test.
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

describe('getFocusAvailability precedence', () => {
  beforeEach(() => {
    // Default: eligible device so each test can relax one guard.
    setPlatform('ios');
    mutableDevice.isDevice = true;
    mutableDevice.osVersion = '18.5';
    mockIsNativeModuleAvailable.mockReturnValue(true);
    mockGetAuthorizationStatus.mockReset();
    mockGetAuthorizationStatus.mockResolvedValue(AuthorizationStatus.Approved);
  });

  it('reports NotIOS on a non-ios platform', async () => {
    setPlatform('android');
    await expect(getFocusAvailability()).resolves.toEqual({
      available: false,
      reason: FocusUnavailableReason.NotIOS,
    });
  });

  it('reports Simulator when !Device.isDevice', async () => {
    mutableDevice.isDevice = false;
    await expect(getFocusAvailability()).resolves.toEqual({
      available: false,
      reason: FocusUnavailableReason.Simulator,
    });
  });

  it('reports ExpoGo when the native module is absent', async () => {
    mockIsNativeModuleAvailable.mockReturnValue(false);
    await expect(getFocusAvailability()).resolves.toEqual({
      available: false,
      reason: FocusUnavailableReason.ExpoGo,
    });
  });

  describe('OSTooOld (osVersion parse, fail-closed)', () => {
    it.each([['15.7'], [null], [''], ['not-a-version']])(
      'reports OSTooOld for %p',
      async (osVersion) => {
        mutableDevice.osVersion = osVersion as string | null;
        await expect(getFocusAvailability()).resolves.toEqual({
          available: false,
          reason: FocusUnavailableReason.OSTooOld,
        });
      },
    );
  });

  describe('eligible osVersion', () => {
    it.each([['18.5'], ['16'], ['16.0']])(
      'is available for %p when authorized',
      async (osVersion) => {
        mutableDevice.osVersion = osVersion;
        await expect(getFocusAvailability()).resolves.toEqual({ available: true });
      },
    );
  });

  it('reports NotAuthorized when status !== Approved', async () => {
    mockGetAuthorizationStatus.mockResolvedValue(AuthorizationStatus.Denied);
    await expect(getFocusAvailability()).resolves.toEqual({
      available: false,
      reason: FocusUnavailableReason.NotAuthorized,
    });
  });

  it('reports NotAuthorized (fail-closed) when the status call rejects', async () => {
    mockGetAuthorizationStatus.mockRejectedValue(new Error('bridge error'));
    await expect(getFocusAvailability()).resolves.toEqual({
      available: false,
      reason: FocusUnavailableReason.NotAuthorized,
    });
  });
});
