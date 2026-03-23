<?php

declare(strict_types=1);

namespace Ozon\Auth;

use Ozon\Repository\UserRepository;

final class AuthService
{
    /** @var UserRepository */
    private $users;

    public function __construct(UserRepository $users)
    {
        $this->users = $users;
    }

    public function register($email, $password)
    {
        $exists = $this->users->findByEmail($email);
        if ($exists !== null) {
            return array(false, 'Email already registered');
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $id = $this->users->create($email, $hash);

        $_SESSION['user_id'] = $id;
        return array(true, null);
    }

    public function login($email, $password)
    {
        $user = $this->users->findByEmail($email);
        if ($user === null) {
            return array(false, 'Invalid credentials');
        }

        $hash = isset($user['password_hash']) ? $user['password_hash'] : '';
        if (!is_string($hash) || !password_verify($password, $hash)) {
            return array(false, 'Invalid credentials');
        }

        $_SESSION['user_id'] = (int)$user['id'];
        return array(true, null);
    }

    public function logout()
    {
        unset($_SESSION['user_id']);
    }

    public function currentUser()
    {
        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        return $this->users->findById((int)$_SESSION['user_id']);
    }
}
