import { useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import {
  AlertCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
const time = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  return `${h ? h + ':' : ''}${h ? String(Math.floor(seconds / 60) % 60).padStart(2, '0') : Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
};
export function VideoPlayer({
  id,
  start = 0,
  onProgress,
}: {
  id: string;
  start?: number;
  onProgress: (position: number, rate: number) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const engine = useRef<HlsType | null>(null);
  const callback = useRef(onProgress);
  callback.current = onProgress;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [error, setError] = useState('');
  const [buffering, setBuffering] = useState(false);
  const [full, setFull] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = video.current!;
    setError('');
    setPosition(0);
    setPlaying(false);
    setLevels([]);
    setQuality(-1);
    const src = `/api/media/${id}/master.m3u8`;
    let disposed = false;
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
          engine.current = hls;
          hls.loadSource(src);
          hls.attachMedia(element);
          hls.on(Hls.Events.MANIFEST_PARSED, () =>
            setLevels(hls.levels.map((l) => ({ height: l.height }))),
          );
          let recovered = false;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
                recovered = true;
                hls.recoverMediaError();
              } else {
                setError('Не удалось воспроизвести видео. Проверьте соединение и повторите.');
                setBuffering(false);
              }
            }
          });
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = src;
        else
          setError(
            'Этот браузер не поддерживает потоковое видео. Используйте актуальную версию Chrome, Firefox или Safari.',
          );
      })
      .catch(() => {
        if (!disposed) setError('Не удалось загрузить плеер. Обновите страницу.');
      });
    const interval = setInterval(() => {
      if (!element.paused && !element.seeking)
        callback.current(element.currentTime, element.playbackRate);
    }, 5000);
    const fullscreen = () => setFull(document.fullscreenElement === wrapper.current);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', fullscreen);
      engine.current?.destroy();
      engine.current = null;
      element.removeAttribute('src');
      element.load();
    };
  }, [id, retry]);
  function toggle() {
    const v = video.current!;
    if (v.paused)
      void v.play().catch(() => setError('Нажмите «Повторить», чтобы снова открыть видео.'));
    else v.pause();
  }
  function seek(value: number) {
    const v = video.current!;
    if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration, value));
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapper.current?.requestFullscreen();
    } catch {
      setError('Полноэкранный режим недоступен в этом браузере.');
    }
  }
  return (
    <div
      ref={wrapper}
      className="video-player"
      tabIndex={0}
      aria-label="Видеоплеер"
      onKeyDown={(e) => {
        if (e.target !== wrapper.current && e.target !== video.current) return;
        if (e.code === 'Space') {
          e.preventDefault();
          toggle();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          seek(position + 10);
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          seek(position - 10);
        }
        if (e.key === 'f') void fullscreen();
      }}
    >
      <div className="video-stage">
        <video
          ref={video}
          playsInline
          preload="metadata"
          poster={`/api/media/${id}/poster.jpg`}
          onClick={toggle}
          onLoadedMetadata={() => {
            const v = video.current!;
            setDuration(v.duration);
            v.currentTime = Math.min(start, Math.max(0, v.duration - 1));
            callback.current(v.currentTime, v.playbackRate);
          }}
          onTimeUpdate={() => setPosition(video.current!.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            callback.current(video.current!.currentTime, video.current!.playbackRate);
          }}
          onEnded={() => callback.current(video.current!.currentTime, video.current!.playbackRate)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
        />
        {!playing && !error && (
          <button className="big-play" onClick={toggle} aria-label="Смотреть видео">
            <Play size={32} fill="currentColor" />
          </button>
        )}
        {buffering && playing && !error && (
          <span className="video-spinner spinner" aria-label="Буферизация" />
        )}
        {error && (
          <div className="video-error" role="alert">
            <AlertCircle size={26} />
            <p>{error}</p>
            <button className="button secondary small" onClick={() => setRetry((r) => r + 1)}>
              Повторить
            </button>
          </div>
        )}
      </div>
      <div className="video-controls">
        <input
          aria-label="Позиция воспроизведения"
          className="video-seek"
          type="range"
          min="0"
          max={Number.isFinite(duration) ? duration : 0}
          step="0.1"
          value={Math.min(position, Number.isFinite(duration) ? duration : 0)}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <div className="video-control-row">
          <button onClick={toggle} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={() => seek(position - 10)} aria-label="Назад на 10 секунд">
            <RotateCcw size={18} />
          </button>
          <button onClick={() => seek(position + 10)} aria-label="Вперёд на 10 секунд">
            <RotateCw size={18} />
          </button>
          <span className="video-time">
            {time(position)}
            <span> / {time(duration)}</span>
          </span>
          <div className="video-controls-spacer" />
          <button
            onClick={() => {
              const v = video.current!;
              v.muted = !v.muted;
              setVolume(v.muted ? 0 : v.volume);
            }}
            aria-label={volume ? 'Выключить звук' : 'Включить звук'}
          >
            {volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <input
            className="volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Громкость"
            onChange={(e) => {
              const v = Number(e.target.value);
              video.current!.muted = false;
              video.current!.volume = v;
              setVolume(v);
            }}
          />
          <select
            aria-label="Скорость воспроизведения"
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              video.current!.playbackRate = r;
              setRate(r);
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option value={r} key={r}>
                {r}×
              </option>
            ))}
          </select>
          <select
            aria-label="Качество видео"
            value={quality}
            onChange={(e) => {
              const q = Number(e.target.value);
              setQuality(q);
              if (engine.current) engine.current.currentLevel = q;
            }}
          >
            <option value="-1">Авто</option>
            {levels.map((l, i) => (
              <option value={i} key={i}>
                {l.height}p
              </option>
            ))}
          </select>
          {document.pictureInPictureEnabled && (
            <button
              aria-label="Картинка в картинке"
              className="pip-button"
              onClick={() => {
                if (document.pictureInPictureElement)
                  void document.exitPictureInPicture().catch(() => {});
                else void video.current?.requestPictureInPicture().catch(() => {});
              }}
            >
              <PictureInPicture2 size={19} />
            </button>
          )}
          <button
            onClick={() => void fullscreen()}
            aria-label={full ? 'Выйти из полного экрана' : 'Полный экран'}
          >
            {full ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
    </div>
  );
}
