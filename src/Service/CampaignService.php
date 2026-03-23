<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class CampaignService
{
    public function __construct(private readonly HttpClient $performanceClient)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function getAllCampaigns(): array
    {
        $response = $this->performanceClient->get('/api/client/campaign');

        if (array_is_list($response)) {
            return $response;
        }

        return $response['list'] ?? $response['campaigns'] ?? [];
    }

    /** @return array<int,array<string,mixed>> */
    public function getCpcCampaigns(): array
    {
        $campaigns = $this->getAllCampaigns();

        return array_values(array_filter($campaigns, static function (array $campaign): bool {
            return ($campaign['advObjectType'] ?? null) === 'SKU';
        }));
    }
}
