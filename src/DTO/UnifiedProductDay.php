<?php

declare(strict_types=1);

namespace Ozon\DTO;

final class UnifiedProductDay
{
    /**
     * @param array<string,mixed> $ad
     * @param array<string,mixed> $organic
     * @param array<string,float|int> $computed
     */
    public function __construct(
        public readonly int $sku,
        public readonly string $day,
        public readonly array $ad,
        public readonly array $organic,
        public readonly array $computed,
    ) {
    }

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'sku' => $this->sku,
            'day' => $this->day,
            'ad' => $this->ad,
            'organic' => $this->organic,
            'computed' => $this->computed,
        ];
    }
}
