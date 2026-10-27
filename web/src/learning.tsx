import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  HardHat,
  ListChecks,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Video,
} from 'lucide-react';
import { api, post, useResource } from './api';
import type { Course, Lesson } from './types';
import { Empty, ErrorMessage, Loading, useNotice } from './ui';
import { VideoPlayer } from './VideoPlayer';
import { HotspotScene } from './Hotspot';
function Quiz({ lesson, onPassed }: { lesson: Lesson; onPassed: (id: string | null) => void }) {
  const [answers, setAnswers] = useState<Record<string, number | number[]>>({});
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const questions = lesson.activity.questions || [];
  async function submit() {
    setBusy(true);
    try {
      const r = await post(`/api/lessons/${lesson.id}/attempt`, { response: answers });
      setResult(r);
      if (r.passed) onPassed(r.certificateId);
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="exercise">
      <div className="exercise-heading">
        <span className="exercise-icon">
          <ListChecks size={25} />
        </span>
        <div>
          <span className="eyebrow">ПРОВЕРКА ЗНАНИЙ</span>
          <h2>Время закрепить материал</h2>
          <p>Для успешного прохождения наберите не менее {lesson.activity.passPercent}%.</p>
        </div>
        <span className="xp-tag">
          <Sparkles size={14} />
          50 XP
        </span>
      </div>
      {questions.map((q, i) => (
        <fieldset
          className={`quiz-question ${result ? (result.feedback.find((f: any) => f.id === q.id)?.correct ? 'correct' : 'incorrect') : ''}`}
          key={q.id}
        >
          <legend>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {q.prompt}
          </legend>
          <p className="question-hint">
            {q.multiple
              ? 'Выберите все правильные варианты. Лишние ответы не допускаются.'
              : 'Выберите один правильный вариант.'}
          </p>
          {q.options.map((option, index) => {
            const answer = answers[q.id];
            const selected = q.multiple
              ? Array.isArray(answer) && answer.includes(index)
              : answer === index;
            return (
              <label key={index} className={`answer-option ${selected ? 'selected' : ''}`}>
                <input
                  type={q.multiple ? 'checkbox' : 'radio'}
                  name={q.id}
                  value={index}
                  checked={selected}
                  disabled={!!result}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setAnswers((previous) => {
                      if (!q.multiple) return { ...previous, [q.id]: index };
                      const current = previous[q.id];
                      const values = Array.isArray(current) ? current : [];
                      return {
                        ...previous,
                        [q.id]: checked
                          ? [...values, index]
                          : values.filter((value) => value !== index),
                      };
                    });
                  }}
                />
                <span className={q.multiple ? 'answer-checkbox' : 'answer-radio'}>
                  {q.multiple && selected && <Check size={12} strokeWidth={3} />}
                </span>
                <span>{option}</span>
              </label>
            );
          })}
          {result && (
            <p className="question-feedback">
              {result.feedback.find((f: any) => f.id === q.id)?.correct
                ? 'Верно. '
                : 'Пока неверно. '}
              {result.feedback.find((f: any) => f.id === q.id)?.explanation}
            </p>
          )}
        </fieldset>
      ))}
      {result ? (
        <div className={`exercise-result ${result.passed ? 'success' : 'retry'}`} role="status">
          {result.passed ? <CheckCircle2 size={25} /> : <CircleHelp size={25} />}
          <div>
            <h3>{result.passed ? 'Отличная работа!' : 'Попробуйте ещё раз'}</h3>
            <p>
              Ваш результат: {result.score}%.{' '}
              {result.passed
                ? 'Урок пройден, баллы начислены.'
                : 'Прочитайте пояснения и закрепите знания.'}
            </p>
          </div>
          {!result.passed && (
            <button
              className="button secondary"
              onClick={() => {
                setResult(undefined);
                setAnswers({});
              }}
            >
              <RotateCcw size={16} />
              Повторить
            </button>
          )}
        </div>
      ) : (
        <button
          className="button primary"
          disabled={
            busy ||
            questions.length === 0 ||
            questions.some((q) => {
              const answer = answers[q.id];
              return q.multiple
                ? !Array.isArray(answer) || answer.length === 0
                : typeof answer !== 'number';
            })
          }
          onClick={() => void submit()}
        >
          {busy ? 'Проверяем…' : 'Проверить ответы'}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
function HotspotExercise({
  lesson,
  onPassed,
}: {
  lesson: Lesson;
  onPassed: (id: string | null) => void;
}) {
  const [point, setPoint] = useState(() => lesson.activity.start ?? { x: 50, y: 85 });
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  async function submit() {
    setBusy(true);
    try {
      const r = await post(`/api/lessons/${lesson.id}/attempt`, { response: point });
      setResult(r);
      if (r.passed) onPassed(r.certificateId);
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="exercise">
      <div className="exercise-heading">
        <span className="exercise-icon">
          <HardHat size={26} />
        </span>
        <div>
          <span className="eyebrow">СИТУАЦИОННАЯ ПРАКТИКА</span>
          <h2>Действуйте безопасно</h2>
          <p>{lesson.activity.instruction}</p>
        </div>
        <span className="xp-tag">
          <Sparkles size={14} />
          75 XP
        </span>
      </div>
      <div className="scene-help">
        <span>Переместите работника в нужную точку сцены.</span>
        <small>Мышь, касание или стрелки клавиатуры</small>
      </div>
      <HotspotScene
        image={lesson.image_id ? `/api/media/${lesson.image_id}/image.webp` : undefined}
        point={point}
        onPoint={(p) => {
          setPoint(p);
          if (!result?.passed) setResult(undefined);
        }}
      />
      {result && (
        <div className={`exercise-result ${result.passed ? 'success' : 'retry'}`} role="status">
          {result.passed ? <CheckCircle2 size={24} /> : <CircleHelp size={24} />}
          <div>
            <h3>
              {result.passed
                ? 'Верно! Вы выбрали безопасное место.'
                : 'Здесь находиться небезопасно'}
            </h3>
            <p>{result.explanation}</p>
          </div>
        </div>
      )}
      {!result?.passed && (
        <button className="button primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Проверяем…' : 'Проверить решение'}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
function LessonVideo({
  lesson,
  onProgress,
}: {
  lesson: Lesson;
  onProgress: (position: number, rate: number) => void;
}) {
  return (
    <div className="panel video-lesson lesson-introduction">
      {lesson.video_status === 'ready' && lesson.video_id ? (
        <VideoPlayer
          key={`${lesson.id}:${lesson.video_id}`}
          id={lesson.video_id}
          start={Number(lesson.position_seconds) || 0}
          onProgress={onProgress}
        />
      ) : (
        <Empty
          title={
            lesson.video_status === 'failed' ? 'Видео не удалось обработать' : 'Видео готовится'
          }
          text={
            lesson.video_status === 'failed'
              ? 'Сообщите администратору курса.'
              : 'Материал появится после обработки.'
          }
        />
      )}
      <div className="video-lesson-note">
        <ShieldNote />
        {lesson.type === 'video'
          ? 'Посмотрите не менее 90% видео, чтобы завершить урок. Позиция сохраняется автоматически.'
          : 'Видео к заданию. После просмотра выполните задание ниже. Позиция сохраняется автоматически.'}
      </div>
    </div>
  );
}
export function LessonPage() {
  const { courseId, lessonId } = useParams();
  const { data, error, refresh, setData } = useResource<Course>(`/api/courses/${courseId}`);
  const navigate = useNavigate();
  const notice = useNotice();
  const [certificate, setCertificate] = useState<string | null>(null);
  const progressInFlight = useRef(false);
  const previousLesson = useRef(lessonId);
  useEffect(() => {
    setCertificate(null);
    if (previousLesson.current !== lessonId) refresh();
    previousLesson.current = lessonId;
  }, [lessonId, refresh]);
  if (error) return <ErrorMessage message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const lessons = data.lessons || [];
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson)
    return (
      <Empty title="Урок недоступен" text="Проверьте, что вы записаны на курс.">
        <Link className="button primary" to={`/courses/${courseId}`}>
          Открыть курс
        </Link>
      </Empty>
    );
  const index = lessons.indexOf(lesson);
  const next = lessons[index + 1];
  const completed = lessons.filter((l) => l.completed_at).length;
  function passed(cert: string | null) {
    setCertificate(cert);
    setData((c) =>
      c
        ? {
            ...c,
            lessons: c.lessons?.map((l) =>
              l.id === lessonId ? { ...l, completed_at: new Date().toISOString() } : l,
            ),
          }
        : c,
    );
  }
  async function progress(position: number, rate: number) {
    if (progressInFlight.current) return;
    progressInFlight.current = true;
    try {
      const r = await post(`/api/lessons/${lessonId}/progress`, { position, rate });
      if (r.completed_at && !lesson?.completed_at) passed(r.certificateId);
    } catch (e) {
      notice(`Прогресс не сохранён: ${(e as Error).message}`, true);
    } finally {
      progressInFlight.current = false;
    }
  }
  return (
    <>
      <Link className="back-link" to={`/courses/${courseId}`}>
        <ArrowLeft size={16} />
        {data.title}
      </Link>
      <div className="learning-layout">
        <div className="lesson-main">
          <div className="lesson-page-heading">
            <span className="eyebrow">
              УРОК {index + 1} ИЗ {lessons.length}
            </span>
            <h1>{lesson.title}</h1>
            {lesson.completed_at && (
              <span className="pill green">
                <Check size={14} />
                Урок пройден
              </span>
            )}
          </div>
          {lesson.type === 'video' ? (
            <>
              <LessonVideo lesson={lesson} onProgress={(p, r) => void progress(p, r)} />
              {lesson.body && (
                <div className="panel lesson-notes">
                  <h3>Кратко об уроке</h3>
                  <p>{lesson.body}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {lesson.video_id && (
                <LessonVideo lesson={lesson} onProgress={(p, r) => void progress(p, r)} />
              )}
              {lesson.type === 'quiz' && lesson.image_id && (
                <figure className="panel exercise-photo">
                  <img src={`/api/media/${lesson.image_id}/image.webp`} alt="Материал к тесту" />
                </figure>
              )}
              <div className="panel">
                {lesson.body && <p className="exercise-intro">{lesson.body}</p>}
                {lesson.type === 'quiz' ? (
                  <Quiz key={lesson.id} lesson={lesson} onPassed={passed} />
                ) : (
                  <HotspotExercise key={lesson.id} lesson={lesson} onPassed={passed} />
                )}
              </div>
            </>
          )}
          {certificate && (
            <div className="course-success">
              <Award size={35} />
              <div>
                <h3>Курс завершён. Поздравляем!</h3>
                <p>Ваш сертификат уже ждёт в достижениях.</p>
              </div>
              <Link className="button primary" to={`/certificates/${certificate}`}>
                Получить сертификат
                <ArrowRight size={17} />
              </Link>
            </div>
          )}
          <div className="lesson-navigation">
            {index > 0 ? (
              <Link className="button secondary" to={`/learn/${courseId}/${lessons[index - 1].id}`}>
                <ArrowLeft size={16} />
                Предыдущий урок
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link className="button primary" to={`/learn/${courseId}/${next.id}`}>
                Следующий урок
                <ArrowRight size={17} />
              </Link>
            ) : (
              <Link className="button secondary" to="/achievements">
                Мои достижения
                <Award size={17} />
              </Link>
            )}
          </div>
        </div>
        <aside className="lesson-outline panel">
          <div>
            <h3>Программа курса</h3>
            <span>
              {completed} из {lessons.length} уроков пройдено
            </span>
            <div className="progress-line">
              <span style={{ width: `${(completed / lessons.length) * 100}%` }} />
            </div>
          </div>
          <nav aria-label="Уроки курса">
            {lessons.map((l, i) => (
              <Link
                className={l.id === lessonId ? 'current' : ''}
                key={l.id}
                to={`/learn/${courseId}/${l.id}`}
              >
                <span className={l.completed_at ? 'done' : ''}>
                  {l.completed_at ? <Check size={15} /> : i + 1}
                </span>
                <div>
                  <strong>{l.title}</strong>
                  <small>
                    {l.type === 'video' ? 'Видеоурок' : l.type === 'quiz' ? 'Тест' : 'Практика'}
                  </small>
                </div>
                {l.id === lessonId && <ChevronRight size={15} />}
              </Link>
            ))}
          </nav>
          <div className="outline-tip">
            <Sparkles size={19} />
            <p>
              Двигайтесь в своём темпе.
              <br />
              Главное — понять и попробовать.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function ShieldNote() {
  return <CheckCircle2 size={17} />;
}
