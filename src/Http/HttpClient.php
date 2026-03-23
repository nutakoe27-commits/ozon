<?php

declare(strict_types=1);

namespace Ozon\Http;

use RuntimeException;

final class HttpClient
{
    /** @var string */
    private $baseUrl;
    /** @var array */
    private $defaultHeaders;

    public function __construct($baseUrl, array $defaultHeaders = array())
    {
        $this->baseUrl = $baseUrl;
        $this->defaultHeaders = $defaultHeaders;
    }

    public function get($path, array $headers = array())
    {
        return $this->request('GET', $path, null, $headers);
    }

    public function post($path, array $body, array $headers = array())
    {
        return $this->request('POST', $path, $body, $headers);
    }

    private function request($method, $path, $body, array $headers)
    {
        $url = rtrim($this->baseUrl, '/') . $path;

        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialize cURL');
        }

        $finalHeaders = array_merge($this->defaultHeaders, $headers);
        $headerLines = array();
        foreach ($finalHeaders as $key => $value) {
            $headerLines[] = $key . ': ' . $value;
        }

        if ($body !== null) {
            $headerLines[] = 'Content-Type: application/json';
        }

        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => $headerLines,
        ));

        if ($body !== null) {
            $jsonBody = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($jsonBody === false) {
                curl_close($ch);
                throw new RuntimeException('Failed to encode JSON body');
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('HTTP request failed: ' . $error);
        }

        $statusCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Invalid JSON response from ' . $path . ': ' . $raw);
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            throw new RuntimeException('HTTP ' . $statusCode . ' for ' . $path . ': ' . json_encode($decoded, JSON_UNESCAPED_UNICODE));
        }

        return $decoded;
    }
}
