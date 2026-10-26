import { getGatewayBaseUrl } from './gatewayConfig';

export interface LearningPlatformSsoPort {
  createLoginUrl(accessToken: string): Promise<string>;
}

/** Gateway-backed LearnWorlds SSO adapter; another learning platform can replace this port. */
export class LearnWorldsSsoAdapter implements LearningPlatformSsoPort {
  constructor(private readonly gatewayBaseUrl = getGatewayBaseUrl()) {}

  async createLoginUrl(accessToken: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.gatewayBaseUrl}/api/v1/integrations/learnworlds/sso`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach the GHA gateway: ${reason}`);
    }

    const body = await response.json().catch(() => ({})) as { url?: string; message?: string; detail?: string };
    if (!response.ok) {
      throw new Error(body.message || body.detail || `Gateway error (${response.status}) creating LearnWorlds SSO login`);
    }
    if (!body.url) throw new Error('Integration service returned no LearnWorlds sign-in URL');

    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      throw new Error('Integration service returned an invalid LearnWorlds sign-in URL');
    }
    if (parsed.protocol !== 'https:') throw new Error('LearnWorlds returned an insecure sign-in URL');
    return parsed.toString();
  }
}
