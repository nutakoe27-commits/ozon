<?php

declare(strict_types=1);

namespace Ozon;

use RuntimeException;

class HttpClient
{
    /** @var string   */ private $baseUrl;
    /** @var string[] */ private $defaultHeaders;

    public function __construct($baseUrl, array $defaultHeaders = array())
    {
        $this->baseUrl        = $baseUrl;
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

    // ── private ──────────────────────────────────────────────────────────────

    private function request($method, $path, $body, array $headers)
    {
        $url = rtrim($this->baseUrl, '/') . $path;

        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialize cURL for ' . $url);
        }

        $finalHeaders = array_merge($this->defaultHeaders, $headers);
        $headerLines  = array();
        foreach ($finalHeaders as $key => $value) {
            $headerLines[] = $key . ': ' . $value;
        }

        if ($body !== null) {
            $headerLines[] = 'Content-Type: application/json';
        }

        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,   // FIX #3: таймаут соединения (раньше отсутствовал)
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_HTTPHEADER     => $headerLines,
        ));

        if ($body !== null) {
            $jsonBody = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($jsonBody === false) {
                curl_close($ch);
                throw new RuntimeException('Failed to encode JSON body for ' . $path);
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            $errno = curl_errno($ch);
            curl_close($ch);
            throw new RuntimeException('HTTP request failed [errno=' . $errno . ']: ' . $error . ' → ' . $url);
        }

        $statusCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        // FIX #4: некоторые эндпоинты Ozon возвращают пустое тело при 204
        if ($statusCode === 204) {
            return array();
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            // FIX #5: API может вернуть массив верхнего уровня — это тоже валидно
            $decodedArray = json_decode($raw, true);
            if (is_array($decodedArray)) {
                $decoded = $decodedArray;
            } else {
                throw new RuntimeException(
                    'Invalid JSON response from ' . $path . ' (HTTP ' . $statusCode . '): '
                    . mb_substr($raw, 0, 300)
                );
            }
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            throw new RuntimeException(
                'HTTP ' . $statusCode . ' for ' . $path . ': '
                . json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }

        return $decoded;
    }
}
