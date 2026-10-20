import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  GraduationCap,
  LockKeyhole,
  Play,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Video,
} from 'lucide-react';
import { api, date, minutes, post, useResource } from './api';
import { useAuth } from './App';
import type { Course, Dashboard, Lesson } from './types';
import {
  CourseArt,
  CourseCard,
  Empty,
  ErrorMessage,
  HeroArt,
  Loading,
  PageHeading,
  useNotice,
} from './ui';

export function DashboardPage() {
  const { user } = useAuth();
  const { data, error, refresh } = useResource<Dashboard>('/api/dashboard');
  const courses = useResource<Course[]>('/api/courses');
  if (error || courses.error)
    return (
      <ErrorMessage
        message={error || courses.error}
        retry={() => {
          refresh();
          courses.refresh();
        }}
      />
    );
  if (!data || !courses.data) return <Loading />;
  const learning = courses.data.filter(
    (c) => c.published && c.enrolled && c.completed_lessons < c.total_lessons,
  );
  const visible = learning.length
    ? learning.slice(0, 2)
    : courses.data.filter((c) => c.published).slice(0, 2);
  const next = learning[0];
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6 + i);
    return {
      key: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(d),
      label: new Intl.DateTimeFormat('ru-RU', {
        weekday: 'short',
        timeZone: 'Europe/Moscow',
      }).format(d),
    };
  });
  return (
    <>
      <PageHeading
        eyebrow="ЛИЧНОЕ ПРОСТРАНСТВО РОСТА"
        title={`Рады видеть, ${user.name.split(' ')[0]}!`}
        text="Новый день — ещё один шаг к безопасной работе."
      >
        <Link to="/courses" className="button secondary">
          Все курсы
          <ArrowUpRight size={17} />
        </Link>
      </PageHeading>
      <section className="welcome-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span />
            УЧИМСЯ ДЕЙСТВОВАТЬ УВЕРЕННО
          </span>
          <h2>
            Знания, которые
            <br />
            защищают каждый день<span>.</span>
          </h2>
          <p>
            Короткие уроки, реальные ситуации и практика.
            <br className="desktop-br" /> Всё, чтобы безопасность стала привычкой.
          </p>
          <Link className="button dark" to={next ? `/courses/${next.id}` : '/courses'}>
            {next ? 'Продолжить обучение' : 'Выбрать свой курс'}
            <ArrowRight size={18} />
          </Link>
          <span className="hero-footnote">
            <ShieldCheck size={14} />В вашем темпе. С пользой для жизни.
          </span>
        </div>
        <HeroArt />
      </section>
      <div className="stats-grid">
        {[
          { label: 'Курсов в обучении', value: data.enrolled, icon: BookOpen, tone: 'sage' },
          {
            label: 'Уроков пройдено',
            value: data.completed_lessons,
            icon: CheckCircle2,
            tone: 'blue',
          },
          { label: 'Баллов опыта', value: data.xp, icon: Sparkles, tone: 'peach' },
          { label: 'Сертификатов', value: data.certificates.length, icon: Award, tone: 'lavender' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div className="stat-card" key={label}>
            <span className={`stat-icon ${tone}`}>
              <Icon size={22} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section>
          <div className="section-title">
            <div>
              <span className="eyebrow">ВАШ СЛЕДУЮЩИЙ ШАГ</span>
              <h2>{learning.length ? 'Продолжить обучение' : 'Откройте новые знания'}</h2>
            </div>
            <Link to="/courses">
              Все курсы
              <ArrowRight size={16} />
            </Link>
          </div>
          {visible.length ? (
            <div className="course-grid two">
              {visible.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          ) : (
            <Empty
              title="Здесь начнётся ваша практика"
              text="Курсы появятся, когда администратор их опубликует."
            >
              {user.role === 'admin' && (
                <Link className="button primary" to="/admin/courses">
                  Создать первый курс
                  <ArrowRight size={16} />
                </Link>
              )}
            </Empty>
          )}
        </section>
        <aside className="growth-panel panel">
          <div className="section-title">
            <h3>Ваш прогресс</h3>
            <span className="sparkle-icon">
              <Sparkles size={19} />
            </span>
          </div>
          <div
            className="level-circle"
            style={{ '--progress': `${((data.xp % 200) / 200) * 100}%` } as React.CSSProperties}
          >
            <div>
              <span>УРОВЕНЬ</span>
              <strong>{data.level}</strong>
              <small>
                {data.xp < 200 ? 'Исследователь' : data.xp < 600 ? 'Практик' : 'Эксперт'}
              </small>
            </div>
          </div>
          <div className="xp-caption">
            <strong>{data.xp % 200}</strong> / 200 XP до следующего уровня
          </div>
          <div className="progress-line">
            <span style={{ width: `${(data.xp % 200) / 2}%` }} />
          </div>
          <div className="activity-heading">
            <span>
              <Flame size={17} />
              Практика за неделю
            </span>
            <strong>{days.filter((d) => data.activityDays.includes(d.key)).length} из 7</strong>
          </div>
          <div className="week-days">
            {days.map((d) => (
              <div key={d.key}>
                <span className={data.activityDays.includes(d.key) ? 'active' : ''}>
                  {data.activityDays.includes(d.key) ? (
                    <Check size={15} />
                  ) : (
                    <span className="day-dot" />
                  )}
                </span>
                <small>{d.label}</small>
              </div>
            ))}
          </div>
          <div className="growth-tip">
            <Target size={21} />
            <p>
              Регулярность важнее скорости.
              <br />
              <strong>Уделите себе один урок сегодня.</strong>
            </p>
          </div>
        </aside>
      </div>
      <section className="daily-note">
        <span className="daily-note-icon">
          <ShieldCheck size={25} />
        </span>
        <div>
          <span className="eyebrow">ПОЛЕЗНО ПОМНИТЬ</span>
          <p>Самое важное средство защиты — ваша внимательность.</p>
        </div>
        <Link to="/help" aria-label="О платформе">
          <ArrowUpRight size={22} />
        </Link>
      </section>
    </>
  );
}
export function CoursesPage() {
  const { data, error, refresh } = useResource<Course[]>('/api/courses');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const published = data.filter((c) => c.published);
  const filtered = published.filter(
    (c) =>
      `${c.title} ${c.category}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'active' && c.enrolled && c.completed_lessons < c.total_lessons) ||
        (filter === 'done' && c.total_lessons > 0 && c.completed_lessons === c.total_lessons)),
  );
  return (
    <>
      <PageHeading
        eyebrow="УЧИМСЯ С ПОЛЬЗОЙ"
        title="Моё обучение"
        text="Знания, которые превращаются в безопасные действия."
      />
      <div className="filter-bar">
        <div className="tabs">
          {[
            ['all', 'Все курсы'],
            ['active', 'В процессе'],
            ['done', 'Завершённые'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === 'all' && <span>{published.length}</span>}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={18} />
          <input
            placeholder="Найти курс"
            aria-label="Поиск курсов"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="course-grid">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <Empty
          title={search ? 'Ничего не нашлось' : 'Пока нет курсов'}
          text={
            search
              ? 'Попробуйте другое название или категорию.'
              : 'Здесь появятся доступные и назначенные вам курсы.'
          }
        />
      )}
    </>
  );
}
export function CoursePage() {
  const { id } = useParams();
  const { data, error, refresh } = useResource<Course>(`/api/courses/${id}`);
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const navigate = useNavigate();
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const lessons = data.lessons || [];
  const completed = lessons.filter((l) => l.completed_at).length;
  const next = lessons.find((l) => !l.completed_at) || lessons[0];
  async function start() {
    setBusy(true);
    try {
      await post(`/api/courses/${id}/enroll`);
      const c = await api<Course>(`/api/courses/${id}`);
      if (c.lessons?.[0]) navigate(`/learn/${id}/${c.lessons[0].id}`);
      else refresh();
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/courses">
        <ArrowLeft size={16} />К моему обучению
      </Link>
      <div className="course-overview panel">
        <div>
          <span className="pill">{data.category}</span>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
          <div className="course-overview-meta">
            <span>
              <BookOpen size={17} />
              {lessons.length || '—'} уроков
            </span>
            <span>
              <ShieldCheck size={17} />
              Сертификат прохождения
            </span>
          </div>
          {data.enrolled && next ? (
            <Link className="button primary" to={`/learn/${id}/${next.id}`}>
              {completed ? 'Продолжить' : 'Начать обучение'}
              <ArrowRight size={18} />
            </Link>
          ) : (
            <button className="button primary" disabled={busy} onClick={() => void start()}>
              {busy ? 'Записываем…' : 'Записаться на курс'}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
        <CourseArt color={data.color} />
      </div>
      <div className="section-title">
        <h2>Программа курса</h2>
        {lessons.length > 0 && (
          <span className="muted-text">
            Пройдено {completed} из {lessons.length}
          </span>
        )}
      </div>
      {!data.enrolled && (
        <div className="info-box">
          <LockKeyhole size={22} />
          <p>Запишитесь на курс, чтобы открыть уроки и сохранять результаты.</p>
        </div>
      )}
      <div className="lesson-list">
        {lessons.map((l, i) => (
          <Link key={l.id} to={`/learn/${id}/${l.id}`} className="lesson-row">
            <span className={`lesson-number ${l.completed_at ? 'completed' : ''}`}>
              {l.completed_at ? <Check size={18} /> : String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <span className="eyebrow">
                {l.type === 'video'
                  ? 'ВИДЕОУРОК'
                  : l.type === 'quiz'
                    ? 'ПРОВЕРКА ЗНАНИЙ'
                    : 'ИНТЕРАКТИВНАЯ ПРАКТИКА'}
              </span>
              <strong>{l.title}</strong>
            </div>
            <span className="lesson-detail">
              {l.type === 'video'
                ? `${minutes(l.duration)} мин`
                : l.type === 'quiz'
                  ? `${l.activity.questions?.length || 0} вопросов`
                  : '+75 XP'}
            </span>
            <ChevronRight size={19} />
          </Link>
        ))}
      </div>
    </>
  );
}
export function AchievementsPage() {
  const { data, error, refresh } = useResource<Dashboard>('/api/dashboard');
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const badges = [
    {
      title: 'Первый шаг',
      text: 'Завершите первый урок',
      icon: GraduationCap,
      earned: data.completed_lessons >= 1,
    },
    {
      title: 'В ритме практики',
      text: 'Заработайте 200 баллов',
      icon: Flame,
      earned: data.xp >= 200,
    },
    {
      title: 'Знания в действии',
      text: 'Завершите первый курс',
      icon: ShieldCheck,
      earned: data.certificates.length > 0,
    },
    {
      title: 'Уверенный практик',
      text: 'Заработайте 600 баллов',
      icon: Trophy,
      earned: data.xp >= 600,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="КАЖДЫЙ ШАГ ИМЕЕТ ЗНАЧЕНИЕ"
        title="Ваши достижения"
        text="Здесь живут результаты вашего труда и новые цели."
      />
      <div className="badge-grid">
        {badges.map(({ title, text, icon: Icon, earned }) => (
          <div key={title} className={`panel achievement ${earned ? 'earned' : ''}`}>
            <span>
              <Icon size={32} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
            <small>
              {earned ? (
                'Получено'
              ) : (
                <>
                  <LockKeyhole size={12} />
                  Ещё впереди
                </>
              )}
            </small>
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>Мои сертификаты</h2>
        <span className="muted-text">{data.certificates.length} получено</span>
      </div>
      {data.certificates.length ? (
        <div className="certificate-grid">
          {data.certificates.map((c) => (
            <Link to={`/certificates/${c.id}`} className="panel certificate-card" key={c.id}>
              <div className="certificate-icon">
                <Award size={35} />
              </div>
              <div>
                <span className="eyebrow">КУРС ЗАВЕРШЁН</span>
                <h3>{c.title}</h3>
                <p>{date(c.issued_at)}</p>
              </div>
              <ArrowUpRight size={20} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Первый сертификат впереди"
          text="Завершите все уроки любого курса — и он появится здесь."
        >
          <Link className="button primary" to="/courses">
            К обучению
            <ArrowRight size={17} />
          </Link>
        </Empty>
      )}
    </>
  );
}
export function CertificatePage() {
  const { id } = useParams();
  const { data, error, refresh } = useResource<any>(`/api/certificates/${id}`);
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="certificate-controls">
        <Link to="/achievements" className="back-link">
          <ArrowLeft size={16} />
          Достижения
        </Link>
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={17} />
          Сохранить PDF / печать
        </button>
      </div>
      <section className="certificate-document">
        <div className="certificate-border">
          <div className="certificate-top">
            ПРАКТИКА<span>ЗНАНИЯ В ДЕЙСТВИИ</span>
          </div>
          <Award size={70} />
          <span className="eyebrow">СЕРТИФИКАТ ПРОХОЖДЕНИЯ</span>
          <h1>
            Уверенность
            <br />в каждом действии
          </h1>
          <p>Подтверждаем, что</p>
          <h2>{data.name}</h2>
          <p>завершил(а) все уроки и задания курса</p>
          <h3>«{data.title}»</h3>
          <div className="certificate-sign">
            <span>{date(data.issued_at)}</span>
            <ShieldCheck size={32} />
            <span>№ {data.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <small>
            Подтверждение прохождения курса на платформе. Не заменяет предусмотренные
            законодательством документы о проверке знаний.
          </small>
        </div>
      </section>
    </>
  );
}
