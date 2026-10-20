import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileVideo,
  Film,
  HardHat,
  ImagePlus,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api, date, post, useResource } from './api';
import type { Course, Lesson, Media, Question, Zone } from './types';
import { CourseCard, Empty, ErrorMessage, Loading, Modal, PageHeading, useNotice } from './ui';
import { VideoUpload } from './Upload';
import { HotspotScene } from './Hotspot';
export function AdminCoursesPage() {
  const { data, error, refresh } = useResource<Course[]>('/api/courses');
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const notice = useNotice();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await post('/api/courses', Object.fromEntries(new FormData(e.currentTarget)));
      navigate(`/admin/courses/${c.id}`);
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const filtered = data.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeading
        eyebrow="ЗНАНИЯ, СОЗДАННЫЕ ВАМИ"
        title="Конструктор курсов"
        text="Собирайте обучение из видео, тестов и реальных ситуаций."
      >
        <button className="button primary" onClick={() => setCreate(true)}>
          <Plus size={18} />
          Создать курс
        </button>
      </PageHeading>
      <div className="filter-bar">
        <span className="muted-text">
          {data.length} курсов · {data.filter((c) => c.published).length} опубликовано
        </span>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Найти курс"
            placeholder="Найти курс"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="course-grid">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} admin />
          ))}
        </div>
      ) : (
        <Empty
          title="Создадим первый курс?"
          text="Начните с темы, а затем добавьте видео и интерактивные задания."
        >
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={18} />
            Создать курс
          </button>
        </Empty>
      )}
      {create && (
        <Modal title="Новый курс" onClose={() => setCreate(false)}>
          <form onSubmit={submit}>
            <label>
              Название курса
              <input
                name="title"
                required
                minLength={3}
                maxLength={180}
                placeholder="Например, безопасная работа на складе"
                autoFocus
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                rows={3}
                maxLength={5000}
                placeholder="Чему научится ученик?"
              />
            </label>
            <label>
              Категория
              <input
                name="category"
                defaultValue="Охрана труда"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Создаём…' : 'Создать и добавить уроки'}
              <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function newLesson(type: Lesson['type'], position: number): Lesson {
  return {
    id: '',
    course_id: '',
    title: '',
    type,
    position,
    body: '',
    video_id: null,
    image_id: null,
    activity:
      type === 'quiz'
        ? {
            passPercent: 80,
            questions: [
              {
                id: crypto.randomUUID(),
                prompt: '',
                options: ['', ''],
                correctIndex: 0,
                explanation: '',
              },
            ],
          }
        : type === 'hotspot'
          ? {
              instruction: 'Переместите работника в безопасную пешеходную зону.',
              target: { x: 4, y: 67, width: 28, height: 26 },
              explanation: 'Внимательно посмотрите на разметку и путь движения транспорта.',
            }
          : {},
  };
}
function LessonEditor({
  lesson,
  onSave,
  onClose,
  courseId,
}: {
  lesson: Lesson;
  onSave: () => void;
  onClose: () => void;
  courseId: string;
}) {
  const [draft, setDraft] = useState<Lesson>(structuredClone(lesson));
  const [busy, setBusy] = useState(false);
  const media = useResource<Media[]>('/api/media');
  const notice = useNotice();
  function field(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function activity(key: string, value: unknown) {
    setDraft((d) => ({ ...d, activity: { ...d.activity, [key]: value } }));
  }
  function question(index: number, update: Partial<Question>) {
    activity(
      'questions',
      draft.activity.questions?.map((q, i) => (i === index ? { ...q, ...update } : q)),
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (draft.id)
        await api(`/api/lessons/${draft.id}`, { method: 'PATCH', body: JSON.stringify(draft) });
      else await post(`/api/courses/${courseId}/lessons`, draft);
      notice('Урок сохранён');
      onSave();
      onClose();
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function image(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('/api/images', { method: 'POST', body: form });
      field('image_id', result.id);
      notice('Сцена загружена');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={lesson.id ? 'Редактировать урок' : 'Новый урок'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>
            Название урока
            <input
              required
              minLength={3}
              maxLength={180}
              value={draft.title}
              onChange={(e) => field('title', e.target.value)}
              placeholder="Что освоим на этом шаге?"
              autoFocus
            />
          </label>
          <label>
            Формат
            <select
              value={draft.type}
              disabled={!!lesson.id}
              onChange={(e) => {
                const fresh = newLesson(e.target.value as Lesson['type'], draft.position);
                setDraft({ ...fresh, title: draft.title, body: draft.body });
              }}
            >
              <option value="video">Видеоурок</option>
              <option value="quiz">Тест</option>
              <option value="hotspot">Визуальное задание</option>
            </select>
          </label>
        </div>
        <label>
          Материал / пояснение
          <textarea
            rows={3}
            maxLength={20000}
            value={draft.body}
            onChange={(e) => field('body', e.target.value)}
            placeholder="Дополнительная информация для ученика"
          />
        </label>
        {draft.type === 'video' && (
          <>
            <label>
              Видео из медиатеки
              <select
                value={draft.video_id || ''}
                onChange={(e) => field('video_id', e.target.value || null)}
              >
                <option value="">Выберите видео</option>
                {media.data
                  ?.filter((m) => m.kind === 'video')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ·{' '}
                      {m.status === 'ready'
                        ? 'Готово'
                        : m.status === 'failed'
                          ? 'Ошибка'
                          : 'Обработка'}
                    </option>
                  ))}
              </select>
            </label>
            {media.error && <p className="form-error">{media.error}</p>}
            <VideoUpload
              onComplete={(id) => {
                field('video_id', id);
                media.refresh();
              }}
            />
            <div className="info-box">
              <Film size={20} />
              <p>
                Урок можно сохранить во время обработки. Публикация курса станет доступна, когда
                видео будет готово.
              </p>
            </div>
          </>
        )}
        {draft.type === 'quiz' && (
          <>
            <div className="quiz-settings">
              <label>
                Проходной результат, %
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={draft.activity.passPercent}
                  onChange={(e) => activity('passPercent', Number(e.target.value))}
                />
              </label>
              <span>Баллы начисляются один раз, за успешное прохождение.</span>
            </div>
            {draft.activity.questions?.map((q, index) => (
              <div className="question-editor" key={q.id}>
                <div className="section-title">
                  <h3>Вопрос {index + 1}</h3>
                  {draft.activity.questions!.length > 1 && (
                    <button
                      type="button"
                      className="icon-button danger-text"
                      aria-label={`Удалить вопрос ${index + 1}`}
                      onClick={() =>
                        activity(
                          'questions',
                          draft.activity.questions!.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
                <label>
                  Текст вопроса
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => question(index, { prompt: e.target.value })}
                  />
                </label>
                <small className="muted-text">Отметьте правильный вариант кружком слева.</small>
                {q.options.map((option, optionIndex) => (
                  <div className="option-editor" key={optionIndex}>
                    <input
                      type="radio"
                      aria-label={`Правильный ответ ${optionIndex + 1} на вопрос ${index + 1}`}
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === optionIndex}
                      onChange={() => question(index, { correctIndex: optionIndex })}
                    />
                    <input
                      required
                      maxLength={500}
                      aria-label={`Вариант ${optionIndex + 1} вопроса ${index + 1}`}
                      value={option}
                      placeholder={`Вариант ответа ${optionIndex + 1}`}
                      onChange={(e) =>
                        question(index, {
                          options: q.options.map((o, i) =>
                            i === optionIndex ? e.target.value : o,
                          ),
                        })
                      }
                    />
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Удалить вариант"
                        onClick={() =>
                          question(index, {
                            options: q.options.filter((_, i) => i !== optionIndex),
                            correctIndex:
                              q.correctIndex === optionIndex
                                ? 0
                                : (q.correctIndex || 0) > optionIndex
                                  ? (q.correctIndex || 0) - 1
                                  : q.correctIndex,
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < 8 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => question(index, { options: [...q.options, ''] })}
                  >
                    <Plus size={15} />
                    Добавить вариант
                  </button>
                )}
                <label>
                  Объяснение после проверки
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={q.explanation || ''}
                    onChange={(e) => question(index, { explanation: e.target.value })}
                    placeholder="Почему этот ответ правильный?"
                  />
                </label>
              </div>
            ))}
            {(draft.activity.questions?.length || 0) < 50 && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  activity('questions', [
                    ...(draft.activity.questions || []),
                    {
                      id: crypto.randomUUID(),
                      prompt: '',
                      options: ['', ''],
                      correctIndex: 0,
                      explanation: '',
                    },
                  ])
                }
              >
                <Plus size={17} />
                Добавить вопрос
              </button>
            )}
          </>
        )}
        {draft.type === 'hotspot' && (
          <>
            <label>
              Задание ученику
              <textarea
                required
                minLength={3}
                maxLength={2000}
                rows={2}
                value={draft.activity.instruction || ''}
                onChange={(e) => activity('instruction', e.target.value)}
              />
            </label>
            <div className="scene-editor-header">
              <div>
                <h3>Рабочая сцена</h3>
                <p>Протяните прямоугольник, чтобы выделить безопасную зону.</p>
              </div>
              <label className="button secondary small image-upload-label">
                <ImagePlus size={16} />
                Своя сцена
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => void image(e.target.files?.[0])}
                />
              </label>
            </div>
            <HotspotScene
              image={draft.image_id ? `/api/media/${draft.image_id}/image.webp` : undefined}
              zone={draft.activity.target}
              onZone={(zone) => activity('target', zone)}
              editing
            />
            <div className="zone-inputs">
              {(['x', 'y', 'width', 'height'] as const).map((key, i) => (
                <label key={key}>
                  {['X, %', 'Y, %', 'Ширина, %', 'Высота, %'][i]}
                  <input
                    type="number"
                    step="0.1"
                    min={i < 2 ? 0 : 3}
                    max={100}
                    required
                    value={Math.round((draft.activity.target?.[key] || 0) * 10) / 10}
                    onChange={(e) =>
                      activity('target', {
                        ...draft.activity.target,
                        [key]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Подсказка после проверки
              <textarea
                rows={2}
                maxLength={2000}
                value={draft.activity.explanation || ''}
                onChange={(e) => activity('explanation', e.target.value)}
              />
            </label>
          </>
        )}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button primary" disabled={busy}>
            <Save size={17} />
            {busy ? 'Сохраняем…' : 'Сохранить урок'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CourseEditor() {
  const { id } = useParams();
  const { data, error, refresh } = useResource<Course>(`/api/courses/${id}`);
  const [editing, setEditing] = useState<Lesson>();
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const navigate = useNavigate();
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const lessons = data.lessons || [];
  async function metadata(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/api/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...Object.fromEntries(form),
          self_enroll: form.get('self_enroll') === 'on',
        }),
      });
      notice('Настройки курса сохранены');
      refresh();
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      await api(`/api/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !data!.published }),
      });
      notice(data!.published ? 'Курс снят с публикации' : 'Курс опубликован');
      refresh();
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setBusy(true);
    try {
      const result = await post(`/api/courses/${id}/copy`);
      navigate(`/admin/courses/${result.id}`);
      notice('Создана новая версия курса');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(l: Lesson) {
    if (!window.confirm(`Удалить урок «${l.title}»?`)) return;
    try {
      await api(`/api/lessons/${l.id}`, { method: 'DELETE' });
      refresh();
      notice('Урок удалён');
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  async function move(l: Lesson, direction: number) {
    const index = lessons.indexOf(l);
    const other = lessons[index + direction];
    if (!other) return;
    setBusy(true);
    try {
      for (let i = 0; i < lessons.length; i++) {
        const current = i === index ? other : i === index + direction ? l : lessons[i];
        await api(`/api/lessons/${current.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ position: i }),
        });
      }
      refresh();
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to="/admin/courses" className="back-link">
        <ArrowLeft size={16} />К конструктору курсов
      </Link>
      <PageHeading
        eyebrow={data.published ? 'ОПУБЛИКОВАННЫЙ КУРС' : 'ЧЕРНОВИК КУРСА'}
        title={data.title}
      >
        <button className="button secondary" disabled={busy} onClick={() => void copy()}>
          <Copy size={17} />
          Новая версия
        </button>
        <button className="button primary" disabled={busy} onClick={() => void publish()}>
          <Send size={17} />
          {data.published ? 'Снять с публикации' : 'Опубликовать'}
        </button>
      </PageHeading>
      <div className="editor-layout">
        <section>
          <div className="section-title">
            <h2>Программа курса</h2>
            <span className="muted-text">{lessons.length} уроков</span>
          </div>
          {data.published && (
            <div className="info-box">
              <ShieldCheck size={20} />
              <p>
                Для редактирования снимите курс с публикации. Если ученики уже начали обучение,
                создайте новую версию — их результаты сохранятся.
              </p>
            </div>
          )}
          <div className="editor-lessons">
            {lessons.map((l, i) => {
              const Icon = l.type === 'video' ? Video : l.type === 'quiz' ? ListChecks : HardHat;
              return (
                <div className="panel editor-lesson" key={l.id}>
                  <span className="editor-lesson-icon">
                    <Icon size={23} />
                  </span>
                  <div>
                    <small>
                      {String(i + 1).padStart(2, '0')} ·{' '}
                      {l.type === 'video'
                        ? 'Видеоурок'
                        : l.type === 'quiz'
                          ? 'Тест'
                          : 'Визуальное задание'}
                    </small>
                    <strong>{l.title}</strong>
                    {l.type === 'video' && l.video_status !== 'ready' && (
                      <small className={l.video_status === 'failed' ? 'danger-text' : 'muted-text'}>
                        {l.video_status === 'failed'
                          ? 'Ошибка обработки видео'
                          : 'Видео обрабатывается или не выбрано'}
                      </small>
                    )}
                  </div>
                  <div className="editor-row-actions">
                    <button
                      className="icon-button"
                      disabled={data.published || busy || i === 0}
                      aria-label="Переместить урок выше"
                      onClick={() => void move(l, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={data.published || busy || i === lessons.length - 1}
                      aria-label="Переместить урок ниже"
                      onClick={() => void move(l, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={data.published}
                      aria-label={`Редактировать ${l.title}`}
                      onClick={() => setEditing(l)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      disabled={data.published}
                      aria-label={`Удалить ${l.title}`}
                      onClick={() => void remove(l)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!data.published && (
            <div className="add-lesson-options">
              {[
                {
                  type: 'video',
                  label: 'Видеоурок',
                  text: 'Загрузите видео и добавьте пояснения',
                  icon: Video,
                },
                {
                  type: 'quiz',
                  label: 'Тест',
                  text: 'Вопросы с выбором правильного ответа',
                  icon: ListChecks,
                },
                {
                  type: 'hotspot',
                  label: 'Визуальное задание',
                  text: 'Сцена, персонаж и безопасная зона',
                  icon: HardHat,
                },
              ].map(({ type, label, text, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => setEditing(newLesson(type as Lesson['type'], lessons.length))}
                >
                  <span>
                    <Icon size={23} />
                  </span>
                  <strong>{label}</strong>
                  <small>{text}</small>
                  <Plus size={18} />
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="panel course-settings">
          <h3>Настройки курса</h3>
          <form onSubmit={metadata}>
            <label>
              Название
              <input
                name="title"
                defaultValue={data.title}
                required
                minLength={3}
                maxLength={180}
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                defaultValue={data.description}
                rows={4}
                maxLength={5000}
              />
            </label>
            <label>
              Категория
              <input
                name="category"
                defaultValue={data.category}
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <label>
              Цвет обложки
              <select name="color" defaultValue={data.color}>
                <option value="sage">Шалфей</option>
                <option value="peach">Тёплый песок</option>
                <option value="blue">Небесный</option>
                <option value="lavender">Лаванда</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="self_enroll" defaultChecked={data.self_enroll} />
              <span>Разрешить самостоятельную запись</span>
            </label>
            <button className="button secondary full" disabled={busy}>
              <Save size={16} />
              Сохранить настройки
            </button>
          </form>
          <Link className="text-button" to={`/courses/${id}`}>
            <ExternalLink size={15} />
            Посмотреть как ученик
          </Link>
        </aside>
      </div>
      {editing && (
        <LessonEditor
          lesson={editing}
          courseId={id!}
          onClose={() => setEditing(undefined)}
          onSave={refresh}
        />
      )}
    </>
  );
}
export function MediaPage() {
  const { data, error, refresh } = useResource<Media[]>('/api/media');
  const pending = useResource<any[]>('/api/uploads');
  const notice = useNotice();
  useEffect(() => {
    if (!data?.some((m) => m.status === 'queued' || m.status === 'processing')) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [data, refresh]);
  async function retry(id: string) {
    try {
      await post(`/api/media/${id}/retry`);
      refresh();
      notice('Видео отправлено на обработку');
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Удалить этот материал с сервера?')) return;
    try {
      await api(`/api/media/${id}`, { method: 'DELETE' });
      refresh();
      notice('Материал удалён');
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  async function cancel(id: string) {
    if (!window.confirm('Удалить незавершённую загрузку?')) return;
    try {
      await api(`/api/uploads/${id}`, { method: 'DELETE' });
      pending.refresh();
      notice('Загрузка отменена');
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="МАТЕРИАЛЫ ДЛЯ ОБУЧЕНИЯ"
        title="Медиатека"
        text="Загружайте видео один раз и используйте в разных курсах."
      />
      <section className="panel media-upload-panel">
        <div className="section-title">
          <h2>Добавить видео</h2>
          <span className="pill">
            <UploadCloud size={14} />
            Загрузка с продолжением
          </span>
        </div>
        <VideoUpload
          onComplete={() => {
            refresh();
            pending.refresh();
          }}
        />
      </section>
      {!!pending.data?.length && (
        <section className="panel pending-uploads">
          <h3>Незавершённые загрузки</h3>
          <p>Чтобы продолжить, выберите тот же файл выше. Для отмены удалите загрузку.</p>
          {pending.data.map((u) => (
            <div key={u.id}>
              <span>
                {u.name}
                <small>
                  {Math.round((Number(u.offset_bytes) / Number(u.size)) * 100)}% загружено
                </small>
              </span>
              <button className="text-button danger-text" onClick={() => void cancel(u.id)}>
                Отменить
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="section-title">
        <h2>Ваши материалы</h2>
        <button className="text-button" onClick={refresh}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      {error ? (
        <ErrorMessage message={error} retry={refresh} />
      ) : !data ? (
        <Loading />
      ) : data.length ? (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Материал</th>
                <th>Формат</th>
                <th>Состояние</th>
                <th>Добавлен</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="media-name">
                      {m.kind === 'video' && m.status === 'ready' ? (
                        <img src={`/api/media/${m.id}/poster.jpg`} alt="" />
                      ) : (
                        <span className="file-icon">
                          <FileVideo size={23} />
                        </span>
                      )}
                      <div>
                        <strong>{m.name}</strong>
                        {m.error && (
                          <details>
                            <summary className="danger-text">Подробности ошибки</summary>
                            <p className="media-error-detail">{m.error}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.kind === 'image'
                      ? 'Изображение'
                      : m.duration
                        ? `${Math.ceil(m.duration / 60)} мин`
                        : 'Видео'}
                  </td>
                  <td>
                    <span
                      className={`pill ${m.status === 'ready' ? 'green' : m.status === 'failed' ? 'red' : 'muted'}`}
                    >
                      {
                        (
                          {
                            ready: 'Готово',
                            queued: 'В очереди',
                            processing: 'Обработка',
                            failed: 'Ошибка',
                          } as Record<string, string>
                        )[m.status]
                      }
                    </span>
                  </td>
                  <td className="nowrap">{date(m.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      {m.status === 'failed' && (
                        <button className="button secondary small" onClick={() => void retry(m.id)}>
                          Повторить
                        </button>
                      )}
                      {['ready', 'failed'].includes(m.status) && (
                        <button
                          className="icon-button danger-text"
                          aria-label={`Удалить ${m.name}`}
                          onClick={() => void remove(m.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Материалы пока не загружены"
          text="Добавьте первое учебное видео с помощью поля выше."
        />
      )}
    </>
  );
}
export function UsersPage() {
  const users = useResource<any[]>('/api/users');
  const courses = useResource<Course[]>('/api/courses');
  const [create, setCreate] = useState(false);
  const [assign, setAssign] = useState<any>();
  const [reset, setReset] = useState<any>();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await post('/api/users', data);
      setCreate(false);
      users.refresh();
      notice('Пользователь создан. Передайте ему данные для входа безопасным способом.');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(u: any) {
    try {
      await api(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active }),
      });
      users.refresh();
      notice(u.active ? 'Аккаунт отключён' : 'Аккаунт включён');
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  async function enroll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const courseId = new FormData(e.currentTarget).get('course');
    setBusy(true);
    try {
      await post(`/api/courses/${courseId}/enrollments`, { userIds: [assign.id] });
      setAssign(undefined);
      users.refresh();
      notice('Курс назначен');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get('password');
    setBusy(true);
    try {
      await api(`/api/users/${reset.id}`, { method: 'PATCH', body: JSON.stringify({ password }) });
      setReset(undefined);
      notice('Пароль изменён. Передайте его пользователю безопасным способом.');
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const filtered = users.data?.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="КОМАНДА, КОТОРАЯ УЧИТСЯ"
        title="Ученики"
        text="Создавайте аккаунты, назначайте курсы и следите за результатами."
      >
        <button className="button primary" onClick={() => setCreate(true)}>
          <UserPlus size={18} />
          Добавить пользователя
        </button>
      </PageHeading>
      <div className="filter-bar">
        <span className="muted-text">{users.data?.length || 0} пользователей</span>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск пользователей"
            placeholder="Имя или почта"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {users.error ? (
        <ErrorMessage message={users.error} retry={users.refresh} />
      ) : !filtered ? (
        <Loading />
      ) : (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль / статус</th>
                <th>Курсов</th>
                <th>Пройдено уроков</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar">{u.name.slice(0, 1)}</span>
                      <div>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`pill ${!u.active ? 'red' : u.role === 'admin' ? '' : 'green'}`}
                    >
                      {!u.active ? 'Отключён' : u.role === 'admin' ? 'Администратор' : 'Ученик'}
                    </span>
                  </td>
                  <td>{u.courses}</td>
                  <td>{u.completed_lessons}</td>
                  <td>
                    <div className="row-actions">
                      <button className="text-button" onClick={() => setAssign(u)}>
                        Назначить курс
                      </button>
                      <button className="text-button" onClick={() => setReset(u)}>
                        Пароль
                      </button>
                      <button
                        className={`text-button ${u.active ? 'danger-text' : ''}`}
                        onClick={() => void toggle(u)}
                      >
                        {u.active ? 'Отключить' : 'Включить'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty title="Никого не нашли" text="Попробуйте изменить поиск." />}
        </div>
      )}
      {create && (
        <Modal title="Добавить пользователя" onClose={() => setCreate(false)}>
          <form onSubmit={add}>
            <label>
              Имя
              <input name="name" required minLength={2} maxLength={100} autoFocus />
            </label>
            <label>
              Электронная почта
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Начальный пароль
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
              <small>Не менее 12 символов. Пользователь сможет изменить его в настройках.</small>
            </label>
            <label>
              Роль
              <select name="role">
                <option value="student">Ученик</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
            <button className="button primary full" disabled={busy}>
              Создать аккаунт
            </button>
          </form>
        </Modal>
      )}
      {assign && (
        <Modal title={`Назначить курс: ${assign.name}`} onClose={() => setAssign(undefined)}>
          <form onSubmit={enroll}>
            <label>
              Курс
              <select name="course" required defaultValue="">
                <option value="" disabled>
                  Выберите курс
                </option>
                {courses.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {!c.published ? ' (черновик)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {courses.error && <p className="form-error">{courses.error}</p>}
            <button className="button primary full" disabled={busy || !courses.data?.length}>
              Назначить
            </button>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal title={`Новый пароль: ${reset.name}`} onClose={() => setReset(undefined)}>
          <form onSubmit={password}>
            <label>
              Новый пароль
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                autoFocus
              />
            </label>
            <button className="button primary full" disabled={busy}>
              Изменить пароль
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ReportsPage() {
  const { data, error, refresh } = useResource<any[]>('/api/reports');
  const [search, setSearch] = useState('');
  const filtered = data?.filter((r) =>
    `${r.name} ${r.course}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="ОТ ПРОЦЕССА К РЕЗУЛЬТАТУ"
        title="Результаты обучения"
        text="Прогресс по каждому ученику и назначенному курсу."
      >
        <a className="button primary" href="/api/reports.csv" download>
          <Download size={17} />
          Скачать CSV
        </a>
      </PageHeading>
      {data && (
        <div className="report-stats stats-grid">
          <div className="stat-card">
            <span className="stat-icon sage">
              <Users />
            </span>
            <div>
              <strong>{new Set(data.map((r) => r.email)).size}</strong>
              <span>Участников обучения</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon blue">
              <BookOpen />
            </span>
            <div>
              <strong>{data.length}</strong>
              <span>Назначений курсов</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon peach">
              <CheckCircle2 />
            </span>
            <div>
              <strong>{data.filter((r) => r.total > 0 && r.completed === r.total).length}</strong>
              <span>Завершено курсов</span>
            </div>
          </div>
        </div>
      )}
      <div className="filter-bar">
        <span className="muted-text">Результаты обновляются после прохождения уроков</span>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск результатов"
            placeholder="Ученик или курс"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <ErrorMessage message={error} retry={refresh} />
      ) : !filtered ? (
        <Loading />
      ) : filtered.length ? (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Курс</th>
                <th>Прогресс</th>
                <th>Результат</th>
                <th>Сертификат</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td>
                    <strong>{r.name}</strong>
                    <small className="table-subtext">{r.email}</small>
                  </td>
                  <td>{r.course}</td>
                  <td>
                    <div className="table-progress">
                      <span>
                        {r.completed} / {r.total}
                      </span>
                      <div className="progress-line">
                        <span
                          style={{ width: `${r.total ? (r.completed / r.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>{r.score !== null ? `${r.score}%` : '—'}</td>
                  <td>
                    {r.certificate_id ? (
                      <Link className="text-button" to={`/certificates/${r.certificate_id}`}>
                        Открыть
                        <ExternalLink size={14} />
                      </Link>
                    ) : (
                      <span className="muted-text">Ещё учится</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Результаты ещё впереди"
          text="Назначьте ученикам курсы — здесь появится их прогресс."
        />
      )}
    </>
  );
}
