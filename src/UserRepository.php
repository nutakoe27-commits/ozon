<?php

declare(strict_types=1);

namespace Ozon;

use PDO;

final class UserRepository
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function findByEmail($email)
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(array('email' => $email));
        $row = $stmt->fetch();

        return is_array($row) ? $row : null;
    }

    public function create($email, $passwordHash)
    {
        $stmt = $this->pdo->prepare('INSERT INTO users(email, password_hash, created_at) VALUES(:email, :password_hash, CURRENT_TIMESTAMP)');
        $stmt->execute(array(
            'email' => $email,
            'password_hash' => $passwordHash,
        ));

        return (int)$this->pdo->lastInsertId();
    }

    public function findById($id)
    {
        $stmt = $this->pdo->prepare('SELECT id, email, created_at FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(array('id' => (int)$id));
        $row = $stmt->fetch();

        return is_array($row) ? $row : null;
    }
}
