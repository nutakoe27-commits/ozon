import { HttpClient } from "../http.js";
import type { PerformanceTokenResponse } from "../types.js";

export class PerformanceAuthService {
  constructor(
    private readonly client: HttpClient,
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async getAccessToken(): Promise<string> {
    const response = await this.client.post<PerformanceTokenResponse>("/api/client/token", {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials"
    });

    return response.access_token;
  }
}
