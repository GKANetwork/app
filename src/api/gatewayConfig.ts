import { Platform } from 'react-native';

export function getGatewayBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_GHA_GATEWAY_URL;
  const defaultUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080';
  return (configuredUrl || defaultUrl).replace(/\/+$/, '');
}
