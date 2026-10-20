import { getGatewayBaseUrl } from './gatewayConfig';

export interface AuthenticatedUser {
  id: string;
  name: string;
  mobile: string;
  countryCode: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export class UserGatewayClient {
  constructor(private readonly gatewayBaseUrl = getGatewayBaseUrl()) {}

  async requestOtp(input: {
    name: string;
    mobile: string;
    countryCode: string;
    country: string;
  }): Promise<void> {
    await this.request('/api/v1/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async verifyOtp(mobile: string, code: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const result = await this.request<AuthResponse>('/api/v1/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code }),
    });
    return { token: result.accessToken, user: result.user };
  }

  getSession(token: string): Promise<AuthenticatedUser> {
    return this.request<AuthenticatedUser>('/api/v1/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async request<T = void>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.gatewayBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        message = body.message || body.detail || body.title || message;
      } catch {
        // Keep the HTTP status message when the server did not return JSON.
      }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export const userGatewayClient = new UserGatewayClient();
