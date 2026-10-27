import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  HardHat,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { post, useResource } from './api';
import type { Course, Lesson, Question } from './types';
import { Empty, ErrorMessage, Loading, useNotice } from './ui';
import { VideoPlayer } from './VideoPlayer';
import { HotspotScene } from './Hotspot';
function SubmittedNotice() {
  return (
    <div className="submission-notice" role="status">
      <CheckCircle2 size={26} />
      <div>
        <h3>Ответ сохранён</h3>
        <p>
          Перейдите к следующему уроку. Результаты откроются после завершения всего курса. Повторная
          отправка недоступна.
        </p>
      </div>
    </div>
  );
}
type Answers = Record<string, number | number[]>;
const allQuestionsAnswered = (questions: Question[], answers: Answers) =>
  questions.every((q) => {
    const answer = answers[q.id];
    return q.multiple ? Array.isArray(answer) && answer.length > 0 : typeof answer === 'number';
  });
function QuestionAnswers({
  questions,
  answers,
  setAnswers,
  busy,
}: {
  questions: Question[];
  answers: Answers;
  setAnswers: Dispatch<SetStateAction<Answers>>;
  busy: boolean;
}) {
  return (
    <>
      {questions.map((q, i) => (
        <fieldset className="quiz-question" key={q.id}>
          <legend>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {q.prompt}
          </legend>
          <p className="question-hint">
            {q.multiple
              ? 'Отметьте варианты, которые считаете правильными. Неверные галочки уменьшают балл.'
              : 'Выберите один вариант.'}
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
                  disabled={busy}
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
        </fieldset>
      ))}
    </>
  );
}
function Quiz({
  lesson,
  onSubmitted,
  onConflict,
}: {
  lesson: Lesson;
  onSubmitted: (available: boolean) => void;
  onConflict: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const questions = lesson.activity.questions || [];
  async function submit() {
    setBusy(true);
    try {
      const result = await post(`/api/lessons/${lesson.id}/attempt`, { response: answers });
      onSubmitted(result.resultsAvailable);
    } catch (error) {
      if ((error as any).status === 409) onConflict();
      else notice((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (lesson.submitted_at) return <SubmittedNotice />;
  return (
    <div className="exercise">
      <div className="exercise-heading">
        <span className="exercise-icon">
          <ListChecks size={25} />
        </span>
        <div>
          <span className="eyebrow">ПРОВЕРКА ЗНАНИЙ</span>
          <h2>Ответьте на все вопросы</h2>
          <p>Одна попытка. После отправки изменить ответы нельзя.</p>
        </div>
        <span className="xp-tag">
          <Sparkles size={14} />
          50 XP
        </span>
      </div>
      <QuestionAnswers
        questions={questions}
        answers={answers}
        setAnswers={setAnswers}
        busy={busy}
      />
      <button
        className="button primary"
        disabled={busy || questions.length === 0 || !allQuestionsAnswered(questions, answers)}
        onClick={() => void submit()}
      >
        {busy ? 'Сохраняем…' : 'Отправить ответы'}
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
function HotspotExercise({
  lesson,
  onSubmitted,
  onConflict,
}: {
  lesson: Lesson;
  onSubmitted: (available: boolean) => void;
  onConflict: () => void;
}) {
  const [point, setPoint] = useState(() => lesson.activity.start ?? { x: 50, y: 85 });
  const [answers, setAnswers] = useState<Answers>({});
  const questions = lesson.activity.questions || [];
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  async function submit() {
    setBusy(true);
    try {
      const result = await post(`/api/lessons/${lesson.id}/attempt`, {
        response: questions.length ? { ...point, answers } : point,
      });
      onSubmitted(result.resultsAvailable);
    } catch (error) {
      if ((error as any).status === 409) onConflict();
      else notice((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (lesson.submitted_at) return <SubmittedNotice />;
  return (
    <div className="exercise">
      <div className="exercise-heading">
        <span className="exercise-icon">
          <HardHat size={26} />
        </span>
        <div>
          <span className="eyebrow">СИТУАЦИОННАЯ ПРОВЕРКА</span>
          <h2>Выберите своё решение</h2>
          <p>{lesson.activity.instruction}</p>
        </div>
        <span className="xp-tag">
          <Sparkles size={14} />
          75 XP
        </span>
      </div>
      <div className="scene-help">
        <span>Переместите работника в выбранную точку. После отправки ответ изменить нельзя.</span>
        <small>Мышь, касание или стрелки</small>
      </div>
      <div className={busy ? 'assessment-pending' : ''}>
        <HotspotScene
          image={lesson.image_id ? `/api/media/${lesson.image_id}/image.webp` : undefined}
          point={point}
          onPoint={setPoint}
        />
      </div>
      {!!questions.length && (
        <section className="visual-question-section">
          <h3>Ответьте на вопросы</h3>
          <p className="question-hint">
            Отправьте положение работника и все ответы вместе. После отправки изменить их нельзя.
          </p>
          <QuestionAnswers
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            busy={busy}
          />
        </section>
      )}
      <button
        className="button primary"
        disabled={busy || !allQuestionsAnswered(questions, answers)}
        onClick={() => void submit()}
      >
        {busy
          ? 'Сохраняем…'
          : questions.length
            ? 'Отправить решение и ответы'
            : 'Отправить решение'}
        <ArrowRight size={18} />
      </button>
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
  const notice = useNotice();
  const progressInFlight = useRef(false);
  const previousLesson = useRef(lessonId);
  useEffect(() => {
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
  function markComplete(available: boolean, submitted = true) {
    setData((course) =>
      course
        ? {
            ...course,
            results_available: available,
            lessons: course.lessons?.map((item) =>
              item.id === lessonId
                ? {
                    ...item,
                    completed_at: new Date().toISOString(),
                    ...(submitted ? { submitted_at: new Date().toISOString() } : {}),
                  }
                : item,
            ),
          }
        : course,
    );
  }
  async function progress(position: number, rate: number) {
    if (progressInFlight.current) return;
    progressInFlight.current = true;
    try {
      const r = await post(`/api/lessons/${lessonId}/progress`, { position, rate });
      if (
        r.completed_at &&
        (!lesson?.completed_at || r.resultsAvailable !== data?.results_available)
      )
        markComplete(r.resultsAvailable, false);
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
                {lesson.type === 'video' ? 'Просмотр завершён' : 'Ответ отправлен'}
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
                  <Quiz
                    key={lesson.id}
                    lesson={lesson}
                    onSubmitted={markComplete}
                    onConflict={refresh}
                  />
                ) : (
                  <HotspotExercise
                    key={lesson.id}
                    lesson={lesson}
                    onSubmitted={markComplete}
                    onConflict={refresh}
                  />
                )}
              </div>
            </>
          )}
          {data.results_available && (
            <div className="course-success">
              <ShieldCheck size={35} />
              <div>
                <h3>Все уроки завершены</h3>
                <p>Ответы сохранены. Теперь можно посмотреть результат проверки.</p>
              </div>
              <Link className="button primary" to={`/courses/${courseId}/results`}>
                Посмотреть результаты
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
              <Link
                className="button secondary"
                to={
                  data.results_available ? `/courses/${courseId}/results` : `/courses/${courseId}`
                }
              >
                {data.results_available ? 'Результаты проверки' : 'К программе курса'}
                <ArrowRight size={17} />
              </Link>
            )}
          </div>
        </div>
        <aside className="lesson-outline panel">
          <div>
            <h3>Программа курса</h3>
            <span>
              {completed} из {lessons.length} уроков завершено
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
