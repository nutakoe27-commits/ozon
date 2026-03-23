<?php

declare(strict_types=1);

namespace Ozon\Service;

use Ozon\Http\HttpClient;
use RuntimeException;

final class PerformanceAuthService
{
    public function __construct(
        private readonly HttpClient $client,
        private readonly string $clientId,
        private readonly string $clientSecret,
    ) {
    }

    public function getAccessToken(): string
    {
        $response = $this->client->post('/api/client/token', [
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'grant_type' => 'client_credentials',
        ]);

        $token = $response['access_token'] ?? null;
        if (!is_string($token) || $token === '') {
            throw new RuntimeException('Performance token response does not contain access_token');
        }

        return $token;
    }
}
