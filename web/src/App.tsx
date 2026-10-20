import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  ChartNoAxesCombined,
  CircleHelp,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { api, post, setCsrf } from './api';
import type { User } from './types';
import { ErrorMessage, Loading, Logo, Modal, Notices, PageHeading, useNotice } from './ui';
import { DashboardPage, CoursesPage, CoursePage, AchievementsPage, CertificatePage } from './pages';
import { LessonPage } from './learning';
import { AdminCoursesPage, CourseEditor, UsersPage, ReportsPage, MediaPage } from './admin';
const Auth = createContext<{ user: User; logout: () => Promise<void> }>(null!);
export const useAuth = () => useContext(Auth);
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/auth/settings')
      .then((r) => setOpen(r.registrationOpen))
      .catch(() => {});
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await post(`/api/auth/${register ? 'register' : 'login'}`, body);
      setCsrf(result.csrf);
      onLogin(result.user);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Logo />
        <div>
          <span className="pill light">
            <ShieldCheck size={15} />
            Обучение, которое защищает
          </span>
          <h1>
            Уверенность
            <br />
            начинается
            <br />с практики<span>.</span>
          </h1>
          <p>
            Смотрите, пробуйте, закрепляйте.
            <br />
            Безопасная работа — навык, который остаётся с вами.
          </p>
          <div className="login-features">
            <span>
              <BookOpen />
              Понятные уроки
            </span>
            <span>
              <Sparkles />
              Интерактивная практика
            </span>
            <span>
              <Award />
              Ваши достижения
            </span>
          </div>
        </div>
        <small>Платформа обучения охране труда</small>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В ПРАКТИКУ</span>
          <h2>{register ? 'Создать аккаунт' : 'С возвращением'}</h2>
          <p>
            {register ? 'Первый шаг к безопасной работе.' : 'Войдите, чтобы продолжить обучение.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Ваше имя
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Александр Иванов"
                />
              </label>
            )}
            <label>
              Электронная почта
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@company.ru"
              />
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={register ? 12 : 1}
                maxLength={200}
                placeholder={register ? 'Не менее 12 символов' : 'Введите пароль'}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти в аккаунт'}
              <ArrowRight size={18} />
            </button>
          </form>
          {open && (
            <p className="auth-switch">
              {register ? 'Уже есть аккаунт?' : 'Первый раз здесь?'}{' '}
              <button
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
              >
                {register ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </p>
          )}
          <div className="login-note">
            <ShieldCheck size={20} />
            <span>Не помните пароль? Обратитесь к администратору вашей организации.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
function Shell() {
  const { user, logout } = useAuth();
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);
  const links = [
    { to: '/', label: 'Обзор', icon: LayoutDashboard },
    { to: '/courses', label: 'Моё обучение', icon: BookOpen },
    { to: '/achievements', label: 'Достижения', icon: Award },
  ];
  const adminLinks = [
    { to: '/admin/courses', label: 'Конструктор курсов', icon: GraduationCap },
    { to: '/admin/media', label: 'Медиатека', icon: BookOpen },
    { to: '/admin/users', label: 'Ученики', icon: Users },
    { to: '/admin/reports', label: 'Отчёты', icon: ChartNoAxesCombined },
  ];
  return (
    <div className="app-shell">
      {mobile && <div className="sidebar-shade" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link to="/" className="brand">
          <Logo />
        </Link>
        <button
          className="sidebar-close icon-button"
          onClick={() => setMobile(false)}
          aria-label="Закрыть меню"
        >
          <X />
        </button>
        <div className="workspace-tag">
          <span className="status-dot" />
          Пространство обучения
        </div>
        <div className="nav-label">ЛИЧНЫЙ КАБИНЕТ</div>
        <nav aria-label="Основная навигация">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        {user.role === 'admin' && (
          <>
            <div className="nav-label">УПРАВЛЕНИЕ</div>
            <nav aria-label="Администрирование">
              {adminLinks.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}>
                  <Icon size={19} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-message">
            <span className="tiny-spark">
              <Sparkles size={19} />
            </span>
            <strong>
              Маленькие шаги.
              <br />
              Большая безопасность.
            </strong>
            <p>Каждый урок — вклад в ваше безопасное завтра.</p>
          </div>
          <Link className="help-link" to="/help">
            <CircleHelp size={18} />
            Как всё устроено
            <ArrowRight size={16} />
          </Link>
          <div className="sidebar-user">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role === 'admin' ? 'Администратор' : 'Ученик'}</small>
            </div>
            <button className="icon-button" onClick={() => void logout()} aria-label="Выйти">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Открыть меню"
            >
              <Menu />
            </button>
            <span className="breadcrumb-home">Личный кабинет</span>
            <span>/</span>
            <strong>
              {location.pathname.startsWith('/admin')
                ? 'Управление'
                : location.pathname.startsWith('/courses') || location.pathname.startsWith('/learn')
                  ? 'Обучение'
                  : location.pathname.startsWith('/achievements')
                    ? 'Достижения'
                    : 'Обзор'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="safety-status">
              <span className="status-dot" />
              Учимся работать безопасно
            </span>
            <Link className="icon-button" to="/settings" aria-label="Настройки аккаунта">
              <Settings size={19} />
            </Link>
            <Link to="/settings" className="avatar small-avatar" aria-label="Мой аккаунт">
              {user.name.slice(0, 1)}
            </Link>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="footer">
          <span>© {new Date().getFullYear()} Практика. Знания в действии.</span>
          <Link to="/help">
            Помощь с обучением <ArrowRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
function AdminGuard({ children }: { children: ReactNode }) {
  return useAuth().user.role === 'admin' ? children : <Navigate to="/" replace />;
}
function SettingsPage() {
  const { user } = useAuth();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await post('/api/auth/password', Object.fromEntries(new FormData(form)));
      form.reset();
      notice('Пароль изменён. Другие сеансы завершены.');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Мой аккаунт" text="Ваш профиль и безопасность входа" />
      <div className="panel settings-panel">
        <div className="profile-heading">
          <span className="avatar large">{user.name.slice(0, 1)}</span>
          <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <span className="pill">{user.role === 'admin' ? 'Администратор' : 'Ученик'}</span>
          </div>
        </div>
        <h3>Изменить пароль</h3>
        <form onSubmit={submit}>
          <label>
            Текущий пароль
            <input name="current" type="password" required autoComplete="current-password" />
          </label>
          <label>
            Новый пароль
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
            />
            <small>Не менее 12 символов</small>
          </label>
          <button className="button primary" disabled={busy}>
            Сохранить пароль
          </button>
        </form>
      </div>
    </>
  );
}
function HelpPage() {
  return (
    <>
      <PageHeading
        eyebrow="ВСЁ ПОЛУЧИТСЯ"
        title="От знаний к действию"
        text="Несколько простых шагов, чтобы освоиться на платформе."
      />
      <div className="help-grid">
        {[
          [
            '01',
            'Выберите курс',
            'Откройте раздел «Моё обучение». Назначенные курсы уже доступны, на открытые можно записаться самостоятельно.',
          ],
          [
            '02',
            'Смотрите и пробуйте',
            'Видеоплеер запоминает позицию. Чтобы завершить видеоурок, посмотрите не менее 90% ролика. Скорость и качество можно менять в плеере.',
          ],
          [
            '03',
            'Закрепляйте знания',
            'Ответьте на вопросы или переместите персонажа в безопасное место. За пройденные уроки вы получаете баллы. Попытки можно повторять.',
          ],
          [
            '04',
            'Отмечайте результат',
            'После всех уроков курса в «Достижениях» появится сертификат прохождения. Его можно распечатать или сохранить в PDF.',
          ],
        ].map(([n, t, p]) => (
          <div className="panel help-card" key={n}>
            <span>{n}</span>
            <h2>{t}</h2>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <div className="info-box">
        <ShieldCheck />
        <p>
          Сертификат платформы подтверждает прохождение курса. Для обязательного обучения, проверки
          знаний и оформления документов по охране труда организация должна соблюдать действующие
          требования законодательства.
        </p>
      </div>
    </>
  );
}
export default function App() {
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    api('/api/auth/me')
      .then((r) => {
        setCsrf(r.csrf);
        setUser(r.user);
      })
      .catch((e) => {
        if (e.status !== 401) setFailure(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    try {
      await post('/api/auth/logout');
      setUser(undefined);
      setCsrf('');
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  if (loading) return <Loading />;
  if (failure) return <ErrorMessage message={failure} retry={() => location.reload()} />;
  return (
    <BrowserRouter>
      <Notices>
        {!user ? (
          <Login onLogin={setUser} />
        ) : (
          <Auth.Provider value={{ user, logout }}>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:id" element={<CoursePage />} />
                <Route path="/learn/:courseId/:lessonId" element={<LessonPage />} />
                <Route path="/achievements" element={<AchievementsPage />} />
                <Route path="/certificates/:id" element={<CertificatePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route
                  path="/admin/courses"
                  element={
                    <AdminGuard>
                      <AdminCoursesPage />
                    </AdminGuard>
                  }
                />
                <Route
                  path="/admin/courses/:id"
                  element={
                    <AdminGuard>
                      <CourseEditor />
                    </AdminGuard>
                  }
                />
                <Route
                  path="/admin/media"
                  element={
                    <AdminGuard>
                      <MediaPage />
                    </AdminGuard>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <AdminGuard>
                      <UsersPage />
                    </AdminGuard>
                  }
                />
                <Route
                  path="/admin/reports"
                  element={
                    <AdminGuard>
                      <ReportsPage />
                    </AdminGuard>
                  }
                />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>Страница не найдена</h1>
                      <Link className="button primary" to="/">
                        На главную
                      </Link>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </Auth.Provider>
        )}
      </Notices>
    </BrowserRouter>
  );
}
