<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;
use RuntimeException;

final class PerformanceAuthService
{
    /** @var HttpClient */
    private $client;
    /** @var string */
    private $clientId;
    /** @var string */
    private $clientSecret;

    public function __construct(HttpClient $client, $clientId, $clientSecret)
    {
        $this->client = $client;
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
    }

    public function getAccessToken()
    {
        $response = $this->client->post('/api/client/token', array(
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'grant_type' => 'client_credentials',
        ));

        $token = isset($response['access_token']) ? $response['access_token'] : null;
        if (!is_string($token) || $token === '') {
            throw new RuntimeException('Performance token response does not contain access_token');
        }

        return $token;
    }
}
