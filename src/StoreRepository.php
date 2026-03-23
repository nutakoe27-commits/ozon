<?php

declare(strict_types=1);

namespace Ozon\Repository;

use PDO;

final class StoreRepository
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function create($userId, $name, $performanceClientId, $performanceClientSecret, $sellerClientId, $sellerApiKey)
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO stores(user_id, name, performance_client_id, performance_client_secret, seller_client_id, seller_api_key, created_at)
             VALUES(:user_id, :name, :pcid, :pcsecret, :scid, :sakey, NOW())'
        );

        $stmt->execute(array(
            'user_id' => (int)$userId,
            'name' => $name,
            'pcid' => $performanceClientId,
            'pcsecret' => $performanceClientSecret,
            'scid' => $sellerClientId,
            'sakey' => $sellerApiKey,
        ));

        return (int)$this->pdo->lastInsertId();
    }

    public function allByUser($userId)
    {
        $stmt = $this->pdo->prepare('SELECT * FROM stores WHERE user_id = :user_id ORDER BY id DESC');
        $stmt->execute(array('user_id' => (int)$userId));

        return $stmt->fetchAll();
    }

    public function findOwnedById($userId, $storeId)
    {
        $stmt = $this->pdo->prepare('SELECT * FROM stores WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(array(
            'id' => (int)$storeId,
            'user_id' => (int)$userId,
        ));

        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }
}
