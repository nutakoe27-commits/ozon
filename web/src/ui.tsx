import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Factory,
  HardHat,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Course } from './types';
import { minutes } from './api';
const NoticeContext = createContext<(text: string, error?: boolean) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function Notices({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ text: string; error: boolean; id: number }>();
  function show(text: string, error = false) {
    const id = Date.now();
    setNotice({ text, error, id });
    setTimeout(() => setNotice((n) => (n?.id === id ? undefined : n)), 6000);
  }
  return (
    <NoticeContext.Provider value={show}>
      {children}
      {notice && (
        <div
          className={`toast ${notice.error ? 'error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.error ? <AlertCircle size={20} /> : <Check size={20} />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(undefined)} aria-label="Закрыть уведомление">
            <X size={17} />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Загружаем…
    </div>
  );
}
export function ErrorMessage({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>Не удалось загрузить данные</strong>
        <p>{message}</p>
        {retry && (
          <button className="button secondary small" onClick={retry}>
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={30} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([hidden]), textarea, select:not(:disabled), a[href]',
        ) || [],
      ).filter((e) => e.offsetParent !== null);
    (dialog.current?.querySelector<HTMLElement>('[autofocus]') || focusable()[0])?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M5 26V6h22v20h-7V13h-8v13Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        практика<span className="logo-dot">.</span>
      </span>
    </span>
  );
}
export function CourseArt({ color = 'sage', small = false }: { color?: string; small?: boolean }) {
  return (
    <div className={`course-art ${color} ${small ? 'small' : ''}`}>
      <div className="art-grid" />
      <span className="art-label">ПРАКТИКА БЕЗОПАСНОСТИ</span>
      <svg viewBox="0 0 360 150" role="img" aria-label="Рабочее пространство и средства защиты">
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M28 130h305M51 129V55l41-22v31l42-23v88M53 79h79M65 94h12v18H65zm34 0h18v18H99zM181 128V69h89v59M191 69V29h14v40M218 83h15v17h-15zm25 0h15v17h-15z" />
          <path d="M287 127V92m-8-4c-9-2-7-14 1-17-5-11 5-24 14-18 9 0 14 15 5 22 7 10-1 18-12 13" />
        </g>
        <circle cx="170" cy="78" r="42" fill="var(--art-circle)" />
        <path d="M147 77c0-18 10-28 24-28s24 10 24 28v7h-48z" fill="var(--art-solid)" />
        <path
          d="M169 49v24m-28 12h59"
          stroke="var(--art-ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M154 87v10c0 20 34 20 34 0V87" fill="var(--art-skin)" />
        <path d="M148 108l-18 13v11h82v-11l-20-13-21 13z" fill="var(--art-solid)" />
        <path d="M149 111l6 21m34-21-6 21" stroke="var(--art-ink)" strokeWidth="4" />
      </svg>
      <span className="art-orbit">
        <ShieldCheck size={17} />
      </span>
    </div>
  );
}
export function CourseCard({ course, admin = false }: { course: Course; admin?: boolean }) {
  const progress = course.total_lessons
    ? Math.round((course.completed_lessons / course.total_lessons) * 100)
    : 0;
  return (
    <Link
      className="course-card"
      to={admin ? `/admin/courses/${course.id}` : `/courses/${course.id}`}
    >
      <CourseArt color={course.color} />
      <div className="course-card-body">
        <div className="eyebrow">
          {course.category}
          <span>•</span>
          {course.duration_seconds > 0
            ? `${minutes(course.duration_seconds)} мин видео`
            : `${course.total_lessons} уроков`}
        </div>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className="course-card-meta">
          <span>
            <BookOpen size={15} />
            {course.total_lessons} уроков
          </span>
          <span
            className={`pill ${admin ? (!course.published ? 'muted' : 'green') : progress === 100 ? 'green' : ''}`}
          >
            {admin
              ? course.published
                ? 'Опубликован'
                : 'Черновик'
              : progress === 100
                ? 'Завершён'
                : progress > 0
                  ? 'В процессе'
                  : course.enrolled
                    ? 'Назначен'
                    : 'Открытый курс'}
          </span>
        </div>
        <div className="progress-line">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="card-bottom">
          <span>{admin ? 'Открыть конструктор' : `${progress}% пройдено`}</span>
          <ArrowUpRight size={18} />
        </div>
      </div>
    </Link>
  );
}
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="floating-badge badge-shield">
        <ShieldCheck size={28} />
        <span>
          Безопасность
          <br />
          <strong>в каждом действии</strong>
        </span>
      </div>
      <div className="floating-badge badge-check">
        <Check size={18} />
        Навык закреплён
      </div>
      <svg viewBox="0 0 320 310">
        <path d="M59 279 108 172l102-4 67 111Z" fill="#345d4c" />
        <path d="M109 174 89 207l14 72h45l5-92m49-15 28 35-13 72h-44l-5-92" fill="#d7ee77" />
        <path d="m125 175 29 37 33-37" fill="#f4faf1" />
        <path d="M122 129v36c0 31 65 32 65 0v-36" fill="#dba77d" />
        <path d="M109 125c0-41 19-65 48-65s50 24 50 65v14h-98Z" fill="#f7bb56" />
        <path d="M155 62v53m-57 24h119" stroke="#172c27" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M132 151h8m33 0h8m-34 18q10 6 20 0"
          stroke="#493d31"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d="m115 198 15 73m68-73-15 73" stroke="#fff9da" strokeWidth="9" />
        <path d="M77 276h168" stroke="#203e32" strokeWidth="8" strokeLinecap="round" />
        <path
          d="m245 77 7 10 17-22"
          fill="none"
          stroke="#345d4c"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="50" cy="160" r="5" fill="#d7ee77" />
        <path d="M269 182v16m-8-8h16" stroke="#8fbc9a" strokeWidth="3" />
      </svg>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export const lessonIcon = { video: Factory, quiz: BookOpen, hotspot: HardHat };
