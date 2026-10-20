import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileVideo, Pause, Play, UploadCloud, X } from 'lucide-react';
import { api, post } from './api';
import { useAuth } from './App';
import { useNotice } from './ui';
const size = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
    : `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
async function fingerprint(file: File) {
  const samples = new Blob([
    file.slice(0, 65536),
    file.slice(Math.max(0, file.size - 65536)),
    `${file.name}:${file.size}:${file.lastModified}`,
  ]);
  const hash = await crypto.subtle.digest('SHA-256', await samples.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export function VideoUpload({ onComplete }: { onComplete?: (id: string) => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'uploading' | 'paused' | 'done'>('idle');
  const [error, setError] = useState('');
  const [limits, setLimits] = useState<any>();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const notice = useNotice();
  useEffect(() => {
    api('/api/storage')
      .then(setLimits)
      .catch((e) => setError(e.message));
    return () => abort.current?.abort();
  }, []);
  function select(f?: File) {
    if (!f) return;
    if (limits && f.size > limits.maxUploadBytes) {
      setError(
        `Лимит файла — ${size(limits.maxUploadBytes)}. Его можно изменить в настройках сервера.`,
      );
      return;
    }
    setFile(f);
    setProgress(0);
    setState('idle');
    setError('');
  }
  async function upload() {
    if (!file) return;
    setState('uploading');
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const key = `praktika-upload-${user.id}-${await fingerprint(file)}`;
      const saved = localStorage.getItem(key);
      let session: any;
      if (saved) {
        try {
          session = await api(`/api/uploads/${saved}`, { signal: controller.signal });
        } catch (e) {
          if ((e as any).status !== 404) throw e;
          localStorage.removeItem(key);
        }
      }
      if (!session) {
        session = await post('/api/uploads', { name: file.name, size: file.size });
        localStorage.setItem(key, session.id);
      }
      if (session.size && session.size !== file.size)
        throw new Error('Размер файла изменился. Выберите исходный файл.');
      let offset = session.offset;
      setProgress((offset / file.size) * 100);
      while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(file.size, offset + session.chunkSize));
        try {
          const result = await api(`/api/uploads/${session.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Upload-Offset': String(offset),
            },
            body: chunk,
            signal: controller.signal,
          });
          offset = result.offset;
        } catch (e) {
          if ((e as any).status === 409) {
            const latest = await api(`/api/uploads/${session.id}`, { signal: controller.signal });
            if (latest.offset === offset) throw e;
            offset = latest.offset;
          } else throw e;
        }
        setProgress((offset / file.size) * 100);
      }
      await post(`/api/uploads/${session.id}/complete`);
      localStorage.removeItem(key);
      setState('done');
      notice('Видео загружено и отправлено на обработку');
      onComplete?.(session.id);
    } catch (e) {
      setState('paused');
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      abort.current = null;
    }
  }
  return (
    <div className="upload-widget">
      <input
        ref={input}
        type="file"
        accept=".mp4,.mov,.webm,.mkv"
        hidden
        onChange={(e) => select(e.target.files?.[0])}
      />
      {!file ? (
        <button
          className="upload-dropzone"
          disabled={!limits}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            select(e.dataTransfer.files[0]);
          }}
        >
          <span>
            <UploadCloud size={28} />
          </span>
          <strong>Перетащите видео сюда</strong>
          <p>или нажмите, чтобы выбрать файл</p>
          <small>
            MP4, MOV, WebM, MKV{' '}
            {limits ? `· до ${size(limits.maxUploadBytes)}` : '· проверяем свободное место…'}
          </small>
        </button>
      ) : (
        <div className="selected-upload">
          <FileVideo size={28} />
          <div className="upload-file-info">
            <strong>{file.name}</strong>
            <small>
              {size(file.size)} ·{' '}
              {state === 'done' ? 'Отправлено на обработку' : `${Math.floor(progress)}%`}
            </small>
            <div className="progress-line">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          {state === 'uploading' ? (
            <button
              className="icon-button"
              onClick={() => abort.current?.abort()}
              aria-label="Приостановить загрузку"
            >
              <Pause size={20} />
            </button>
          ) : state === 'done' ? (
            <CheckCircle2 className="green-text" />
          ) : (
            <button className="button primary small" onClick={() => void upload()}>
              {state === 'paused' ? <Play size={15} /> : <UploadCloud size={15} />}{' '}
              {state === 'paused' ? 'Продолжить' : 'Загрузить'}
            </button>
          )}
          {state !== 'uploading' && (
            <button
              className="icon-button"
              aria-label="Выбрать другой файл"
              onClick={() => {
                setFile(undefined);
                setState('idle');
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="upload-note">
        <CheckCircle2 size={16} />
        <span>
          Загрузка частями. После обрыва выберите тот же файл — передача продолжится с сохранённого
          места.
        </span>
      </div>
      {limits && (
        <small className="muted-text">
          Свободно на диске: {size(limits.freeBytes)}. Для обработки нужен запас места.
        </small>
      )}
    </div>
  );
}
