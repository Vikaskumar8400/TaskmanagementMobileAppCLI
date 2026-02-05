// Copyright (c) Microsoft.
// Licensed under the MIT license.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareAsc, parseISO, sub } from 'date-fns';
import qs from 'qs';
import { AuthConfig } from './AuthConfig';

const config = {
  clientId: AuthConfig.appId,
  redirectUrl: 'graph-sample://react-native-auth/',
  scopes: AuthConfig.appScopes.join(' '),
  serviceConfiguration: {
    authorizationEndpoint:
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
};

export class AuthManager {
  static saveTokenAsync = async (
    accessToken: string,
    refreshToken: string,
    expireTime: string
  ) => {
    await AsyncStorage.setItem('userToken', accessToken);
    await AsyncStorage.setItem('refreshToken', refreshToken);
    await AsyncStorage.setItem('expireTime', expireTime);
  };

  static signOutAsync = async () => {
    // Clear storage
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('expireTime');
  };

  static getRefreshTokenAsync = async () => {
    return await AsyncStorage.getItem('refreshToken');
  };

  static getAccessTokenAsync = async () => {
    const expireTime = await AsyncStorage.getItem('expireTime');

    if (expireTime !== null) {
      // Get expiration time - 5 minutes
      // If it's <= 5 minutes before expiration, then refresh
      const expire = sub(parseISO(expireTime), { minutes: 5 });
      const now = new Date();

      if (compareAsc(now, expire) >= 0) {
        // Expired, refresh
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
          return null;
        }

        try {
          const result = await AuthManager.refreshTokenAsync(refreshToken);

          // Store the new access token, refresh token, and expiration time in storage
          // Note: Microsoft Identity Platform returns 'expires_in' (seconds), not a date. 
          // We need to calculate expiration date.
          const newExpireTime = new Date(new Date().getTime() + (result.expires_in * 1000));

          await AsyncStorage.setItem('userToken', result.access_token);
          if (result.refresh_token) {
            await AsyncStorage.setItem('refreshToken', result.refresh_token);
          }
          await AsyncStorage.setItem(
            'expireTime',
            newExpireTime.toISOString(),
          );

          return result.access_token;
        } catch (e) {
          console.error("Error refreshing token", e);
          return null;
        }
      }

      // Not expired, just return saved access token
      const accessToken = await AsyncStorage.getItem('userToken');
      return accessToken;
    }

    return null;
  };

  private static refreshTokenAsync = async (refreshToken: string) => {
    const response = await fetch(config.serviceConfiguration.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: qs.stringify({
        client_id: config.clientId,
        scope: config.scopes,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: config.redirectUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Refresh token failed: ${response.statusText}`);
    }

    return await response.json();
  }
}
