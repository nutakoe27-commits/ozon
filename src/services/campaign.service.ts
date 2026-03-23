import { HttpClient } from "../http.js";
import type { Campaign } from "../types.js";

interface CampaignListResponse {
  list?: Campaign[];
  campaigns?: Campaign[];
}

export class CampaignService {
  constructor(private readonly performanceClient: HttpClient) {}

  async getAllCampaigns(): Promise<Campaign[]> {
    const response = await this.performanceClient.get<CampaignListResponse | Campaign[]>("/api/client/campaign");

    if (Array.isArray(response)) {
      return response;
    }

    return response.list ?? response.campaigns ?? [];
  }

  async getCpcCampaigns(): Promise<Campaign[]> {
    const campaigns = await this.getAllCampaigns();
    return campaigns.filter((c) => c.advObjectType === "SKU");
  }
}
