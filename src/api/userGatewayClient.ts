import { getGatewayBaseUrl } from './gatewayConfig';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
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
    email: string;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${this.gatewayBaseUrl}${path}`, {
        ...init,
        signal: init.signal || controller.signal,
        headers: {
          Accept: 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Gateway request timed out after 15 seconds (${path})`);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach the GHA gateway (${path}): ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
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
