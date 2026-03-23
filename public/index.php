<?php

declare(strict_types=1);

$file = __DIR__ . '/../storage/data/unified.json';
$payload = ['promotedSkus' => [], 'unified' => []];
if (is_file($file)) {
    $decoded = json_decode((string)file_get_contents($file), true);
    if (is_array($decoded)) {
        $payload = $decoded;
    }
}

$rows = $payload['unified'] ?? [];
?>
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ozon Dashboard (PHP)</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
        table { width: 100%; border-collapse: collapse; background: #111827; }
        th, td { border: 1px solid #334155; padding: 8px; font-size: 14px; }
        th { background: #1e293b; text-align: left; }
        .muted { color: #94a3b8; }
    </style>
</head>
<body>
<h1>Ozon Ads Dashboard (PHP)</h1>
<p class="muted">Запусти <code>php bin/run.php</code>, чтобы обновить <code>storage/data/unified.json</code>.</p>

<table>
    <thead>
    <tr>
        <th>SKU</th>
        <th>Дата</th>
        <th>Показы</th>
        <th>Клики</th>
        <th>Расход</th>
        <th>Заказы</th>
        <th>Выручка</th>
        <th>ROAS</th>
        <th>ACOS</th>
    </tr>
    </thead>
    <tbody>
    <?php foreach ($rows as $row): ?>
        <tr>
            <td><?= htmlspecialchars((string)($row['sku'] ?? '')) ?></td>
            <td><?= htmlspecialchars((string)($row['day'] ?? '')) ?></td>
            <td><?= htmlspecialchars((string)($row['ad']['impressions'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['ad']['clicks'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['ad']['spend'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['ad']['orders'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['ad']['revenue'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['computed']['roas'] ?? 0)) ?></td>
            <td><?= htmlspecialchars((string)($row['computed']['acos'] ?? 0)) ?></td>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>
</body>
</html>
