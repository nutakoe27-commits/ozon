<?php
declare(strict_types=1);

namespace Ozon\Controller;

use Ozon\UserRepository;

final class AuthController
{
    /** @var UserRepository */
    private $userRepo;

    public function __construct(UserRepository $userRepo)
    {
        $this->userRepo = $userRepo;
    }

    // ── GET /login ────────────────────────────────────────────────────────────
    public function loginPage(): void
    {
        // Уже залогинен — редирект на дашборд
        if (!empty($_SESSION['user_id'])) {
            header('Location: /');
            exit;
        }
        readfile(__DIR__ . '/../../login.html');
    }

    // ── POST /login ───────────────────────────────────────────────────────────
    public function loginSubmit(): void
    {
        $body     = $this->parseJsonBody();
        $email    = trim($body['email']    ?? '');
        $password = trim($body['password'] ?? '');

        if ($email === '' || $password === '') {
            $this->jsonError('Email и пароль обязательны', 400);
            return;
        }

        $user = $this->userRepo->findByEmail($email);

        if ($user === null || !password_verify($password, $user['password_hash'])) {
            $this->jsonError('Неверный email или пароль', 401);
            return;
        }

        // Фиксация сессии против session fixation
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['email']   = $user['email'];

        $this->json(['ok' => true, 'redirect' => '/']);
    }

    // ── POST /logout ──────────────────────────────────────────────────────────
    public function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 3600,
                $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        $this->json(['ok' => true, 'redirect' => '/login']);
    }

    // ── POST /register ────────────────────────────────────────────────────────
    public function register(): void
    {
        $body     = $this->parseJsonBody();
        $email    = trim($body['email']    ?? '');
        $password = trim($body['password'] ?? '');

        if ($email === '' || $password === '') {
            $this->jsonError('Email и пароль обязательны', 400);
            return;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->jsonError('Некорректный email', 400);
            return;
        }
        if (strlen($password) < 8) {
            $this->jsonError('Пароль минимум 8 символов', 400);
            return;
        }

        if ($this->userRepo->findByEmail($email) !== null) {
            $this->jsonError('Пользователь с таким email уже существует', 409);
            return;
        }

        $hash   = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $userId = $this->userRepo->create($email, $hash);

        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['email']   = $email;

        $this->json(['ok' => true, 'redirect' => '/']);
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    private function parseJsonBody(): array
    {
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '', true);
        return is_array($data) ? $data : [];
    }

    private function json(array $data): void
    {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }

    private function jsonError(string $msg, int $code): void
    {
        http_response_code($code);
        $this->json(['error' => $msg]);
    }
}
