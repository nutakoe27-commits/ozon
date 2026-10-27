import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Award, ClipboardList, ShieldCheck } from 'lucide-react';
import { useResource } from './api';
import { ErrorMessage, Loading, PageHeading } from './ui';
import type { AssessmentResult } from './types';
export const formatPercent = (value: number | null | undefined) =>
  value == null
    ? '—'
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}%`;
export function CourseResultsPage() {
  const { id } = useParams();
  const { data, error, refresh } = useResource<AssessmentResult>(`/api/courses/${id}/results`);
  if (error)
    return (
      <>
        <Link className="back-link" to={`/courses/${id}`}>
          <ArrowLeft size={16} />К программе курса
        </Link>
        <ErrorMessage message={error} retry={refresh} />
      </>
    );
  if (!data) return <Loading />;
  return (
    <>
      <Link className="back-link" to="/courses">
        <ArrowLeft size={16} />
        Моё обучение
      </Link>
      <PageHeading
        eyebrow="ПРОВЕРКА ЗНАНИЙ ЗАВЕРШЕНА"
        title="Ваши результаты"
        text={data.course.title}
      />
      <div className="panel assessment-summary">
        <span className="assessment-summary-icon">
          <ClipboardList size={34} />
        </span>
        <div>
          <span className="eyebrow">ИТОГОВАЯ ОЦЕНКА</span>
          <strong className="assessment-total-score">
            {data.assessment_total ? formatPercent(data.score) : 'Просмотр завершён'}
          </strong>
          <p>
            {data.assessment_total
              ? 'Среднее значение оценок тестовых и визуальных уроков.'
              : 'Все видеоуроки просмотрены.'}
          </p>
          <p>
            {data.passed
              ? 'Порог проверки достигнут во всех заданиях.'
              : 'Проверка завершена. В отдельных заданиях порог не достигнут.'}
          </p>
        </div>
        {data.certificateId && (
          <Link className="button primary" to={`/certificates/${data.certificateId}`}>
            <Award size={18} />
            Получить сертификат
          </Link>
        )}
      </div>
      <div className="section-title">
        <h2>Результаты по урокам</h2>
        <span className="muted-text">Одна отправка на задание</span>
      </div>
      <div className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Урок</th>
              <th>Результат</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {data.lessons.map((lesson) => (
              <tr key={lesson.id}>
                <td>
                  <strong>{lesson.title}</strong>
                </td>
                <td>
                  <strong>
                    {lesson.type === 'video' ? 'Просмотрено' : formatPercent(lesson.score)}
                  </strong>
                </td>
                <td>
                  {lesson.type === 'video'
                    ? 'Завершён'
                    : lesson.passed
                      ? 'Порог достигнут'
                      : 'Ниже порога'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="info-box assessment-result-note">
        <ShieldCheck size={22} />
        <p>
          Результаты сохранены. Правильные варианты и расположение оценочных зон не показываются.
          Повторно отправить ответы нельзя.
        </p>
      </div>
    </>
  );
}
