<?php

declare(strict_types=1);

namespace Ozon\DTO;

final class UnifiedProductDay
{
    /** @var int */
    private $sku;
    /** @var string */
    private $day;
    /** @var array */
    private $ad;
    /** @var array */
    private $organic;
    /** @var array */
    private $computed;

    public function __construct($sku, $day, array $ad, array $organic, array $computed)
    {
        $this->sku = (int)$sku;
        $this->day = (string)$day;
        $this->ad = $ad;
        $this->organic = $organic;
        $this->computed = $computed;
    }

    public function toArray()
    {
        return array(
            'sku' => $this->sku,
            'day' => $this->day,
            'ad' => $this->ad,
            'organic' => $this->organic,
            'computed' => $this->computed,
        );
    }
}
