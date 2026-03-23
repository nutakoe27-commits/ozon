<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;

final class CampaignService
{
    /** @var HttpClient */
    private $performanceClient;

    public function __construct(HttpClient $performanceClient)
    {
        $this->performanceClient = $performanceClient;
    }

    public function getAllCampaigns()
    {
        $response = $this->performanceClient->get('/api/client/campaign');

        if ($this->isList($response)) {
            return $response;
        }

        if (isset($response['list']) && is_array($response['list'])) {
            return $response['list'];
        }

        if (isset($response['campaigns']) && is_array($response['campaigns'])) {
            return $response['campaigns'];
        }

        return array();
    }

    public function getCpcCampaigns()
    {
        $campaigns = $this->getAllCampaigns();
        $out = array();

        foreach ($campaigns as $campaign) {
            if (is_array($campaign) && isset($campaign['advObjectType']) && $campaign['advObjectType'] === 'SKU') {
                $out[] = $campaign;
            }
        }

        return $out;
    }

    private function isList(array $arr)
    {
        $i = 0;
        foreach ($arr as $key => $_value) {
            if ($key !== $i++) {
                return false;
            }
        }
        return true;
    }
}
