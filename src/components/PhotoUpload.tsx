"use client";
/* eslint-disable @next/next/no-img-element -- blob:-превью и подписанные адреса
   хранилища сайта: next/image их не оптимизирует, а размеров заранее нет. */
// Фото дефекта — единственный клиентский компонент осмотра, и вот почему.
//
// Кадры уходят на сервер СРАЗУ ПРИ СЪЁМКЕ, а не при отправке отчёта.
// Мастер стоит в яме с телефоном, снимает четыре кадра, выбирает узел,
// формулировку — и дефект уже в отчёте. Если бы файлы ехали вместе с формой,
// обещание шторки «кадры уходят на сервер сразу, а без связи появится
// плашка “не ушло”» было бы нечем выполнить: обычная форма либо отправится
// целиком с мегабайтами, либо не отправится вовсе, и о судьбе каждого кадра
// человек не узнает. Здесь каждый файл — своя маленькая история: адрес у
// сайта → PUT прямо в хранилище (docs/API-sushchnosti.md: через контейнер
// приложения мегабайты не гоняем) → пришить к дефекту. Не ушло — честная
// плашка с повтором на том же месте.
//
// Что дальше делает кадр, зависит от места:
//  - в шторке съёмки дефекта ещё нет: удачные кадры становятся скрытыми
//    полями <input name="photo">, и формы шторки уносят их с дефектом;
//  - на карточке дефекта (defectId задан) кадр пришивается сразу, и экран
//    обновляется с сервера — состояния «список фото» здесь нет, оно у сайта.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attachPhotoAction, createPhotoUploadAction } from "@/app/(app)/osmotr-actions";
import { Icon } from "@/components/Icon";
import { MAX_PHOTOS } from "@/lib/inspection";

type Shot = {
  key: number;
  /** Что реально уходит в хранилище: сжатый кадр, а при сбое сжатия — исходник. */
  blob: Blob;
  /** blob:-адрес превью; делается из уменьшенной версии, отзывается при уходе со страницы. */
  preview: string;
  status: "uploading" | "done" | "failed";
  photoId?: string;
  error?: string;
};

type Props = {
  bookingId: number;
  /** Задан — кадры пришиваются к этому дефекту; нет — уходят скрытыми полями формы. */
  defectId?: number;
  /** Что уже есть у дефекта — рисуем рядом с новым, чтобы лимит считался честно. */
  photos?: { id: string; url: string }[];
  /**
   * capture — большой слот и три малых в шторке съёмки;
   * slot — квадрат 72×72 в строке «В отчёте»;
   * grid — ряд до четырёх кадров в карточке отчёта.
   */
  variant: "capture" | "slot" | "grid";
};

const FAIL_SHORT = "фото не ушло · повторить";
const FAIL_LONG = "Один кадр не ушёл — в отчёте пункт будет «без фото»";

/** Кадр с камеры — 4–12 МБ; в хранилище нужен снимок, а не исходник. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.8;
/** PUT в хранилище не должен висеть вечно на плохой связи. */
const PUT_TIMEOUT_MS = 60_000;

/**
 * Сжатие на клиенте перед загрузкой: createImageBitmap → Canvas → JPEG.
 * Что-то пошло не так (формат не разобран, нет canvas) — уходит исходный
 * файл: потерять кадр из-за нашей оптимизации недопустимо.
 */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", JPEG_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}

let seq = 0;

export function PhotoUpload({ bookingId, defectId, photos = [], variant }: Props) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  // blob:-адреса превью живут, пока жива страница; уходим — освобождаем.
  useEffect(() => {
    const list = previews.current;
    return () => { for (const url of list) URL.revokeObjectURL(url); };
  }, []);

  const patch = (key: number, p: Partial<Shot>) =>
    setShots(list => list.map(s => (s.key === key ? { ...s, ...p } : s)));

  // Сколько кадров сейчас в полёте (адрес + PUT). По нему находим последний
  // кадр пачки: обновление экрана с сервера делаем один раз, а не на каждый
  // кадр — иначе четыре снимка подряд давали четыре перерисовки карточки.
  const inflight = useRef(0);

  async function upload(shot: Shot) {
    patch(shot.key, { status: "uploading", error: undefined });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      patch(shot.key, { status: "failed", error: "нет связи" });
      return;
    }
    inflight.current += 1;
    // Своя загрузка закончилась до attach — флаг, чтобы finally не вычел
    // счётчик второй раз.
    let landed = false;
    try {
      const up = await createPhotoUploadAction(shot.blob.type || "image/jpeg");
      if (!up.ok) throw new Error(up.error);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PUT_TIMEOUT_MS);
      let put: Response;
      try {
        put = await fetch(up.data.uploadUrl, {
          method: "PUT",
          body: shot.blob,
          headers: { "content-type": shot.blob.type || "image/jpeg" },
          signal: ctrl.signal,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") throw new Error("не ушло за минуту");
        throw e;
      } finally {
        clearTimeout(timer);
      }
      if (!put.ok) throw new Error(`хранилище ответило ${put.status}`);
      if (defectId) {
        // Свои мегабайты уже в хранилище; если других кадров в полёте нет —
        // этот последний, и после него экран обновляем один раз на пачку.
        inflight.current -= 1;
        landed = true;
        const last = inflight.current === 0;
        const att = await attachPhotoAction({ bookingId, defectId, photoId: up.data.photoId, last });
        if (!att.ok) throw new Error(att.error);
        patch(shot.key, { status: "done", photoId: up.data.photoId });
        if (last) {
          // Кадры уже у дефекта на сайте: убираем свои копии и просим свежую
          // карточку — иначе они считались бы дважды, и лимит срабатывал бы рано.
          setShots(list => {
            for (const s of list) if (s.status === "done") URL.revokeObjectURL(s.preview);
            return list.filter(s => s.status !== "done");
          });
          router.refresh();
        }
        return;
      }
      patch(shot.key, { status: "done", photoId: up.data.photoId });
    } catch (e) {
      patch(shot.key, { status: "failed", error: e instanceof Error ? e.message : "не ушло" });
    } finally {
      if (!landed) inflight.current -= 1;
    }
  }

  async function onPick(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length - shots.filter(s => s.status !== "failed").length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (picked.length === 0) return;
    if (input.current) input.current.value = "";
    // Сжимаем до постановки в очередь: превью делаем из уменьшенной версии,
    // полные blob'ы кадров с камеры в памяти не держим.
    const fresh: Shot[] = [];
    for (const file of picked) {
      const blob = await compress(file);
      fresh.push({ key: ++seq, blob, preview: URL.createObjectURL(blob), status: "uploading" });
    }
    previews.current.push(...fresh.map(s => s.preview));
    setShots(list => [...list, ...fresh]);
    for (const s of fresh) void upload(s);
  }

  const done = shots.filter(s => s.status === "done");
  const failed = shots.filter(s => s.status === "failed");
  const total = photos.length + shots.filter(s => s.status !== "failed").length;
  const full = total >= MAX_PHOTOS;

  const picker = (
    <input
      ref={input} type="file" accept="image/*" capture="environment" multiple
      className="ph-input" aria-label="Снять фото"
      disabled={full}
      onChange={e => void onPick(e.target.files)}
    />
  );
  // Скрытые поля — только там, где кадр ещё некуда пришить: их унесёт форма шторки.
  const hidden = !defectId && done.map(s => <input key={s.key} type="hidden" name="photo" value={s.photoId} />);

  const retry = (s: Shot, label: string) => (
    <button key={s.key} type="button" className="ph-fail" onClick={() => void upload(s)}>{label}</button>
  );

  if (variant === "capture") {
    const all = [...photos.map(p => ({ key: p.id, src: p.url, status: "done" as const })), ...shots.map(s => ({ key: String(s.key), src: s.preview, status: s.status }))];
    const [first, ...rest] = all;
    return (
      <div className="ph-cap">
        <label className={`ph-slot ph-main${first ? " has" : ""}`} data-status={first?.status}>
          {first ? <img src={first.src} alt="" /> : <span>Снять фото — до 4 за раз</span>}
          {!first && picker}
        </label>
        <div className="ph-row">
          {[0, 1, 2].map(i => {
            const s = rest[i];
            return (
              <label key={i} className={`ph-slot ph-small${s ? " has" : ""}`} data-status={s?.status}>
                {s ? <img src={s.src} alt="" /> : <span>+</span>}
                {!s && first && i === rest.length && picker}
              </label>
            );
          })}
        </div>
        {failed.map(s => retry(s, `${FAIL_SHORT}${s.error ? ` · ${s.error}` : ""}`))}
        {hidden}
      </div>
    );
  }

  if (variant === "slot") {
    const first = photos[0]?.url ?? shots.find(s => s.status !== "failed")?.preview ?? null;
    const uploading = !photos[0] && shots.some(s => s.status === "uploading");
    return (
      <>
        <label className={`ph-slot ph-sq${first ? " has" : ""}`} data-status={uploading ? "uploading" : undefined}>
          {first ? <img src={first} alt="" /> : <span><Icon name="camera" size={18} />Фото</span>}
          {!full && picker}
        </label>
        {failed.map(s => retry(s, FAIL_SHORT))}
      </>
    );
  }

  // grid — карточка отчёта: плашка над кадрами, как в макете.
  const cells = [
    ...photos.map(p => ({ key: p.id, src: p.url, status: "done" as const })),
    ...shots.filter(s => s.status !== "failed").map(s => ({ key: String(s.key), src: s.preview, status: s.status })),
  ];
  return (
    <>
      {failed.length > 0 && (
        <div className="ph-fail-card" role="alert">
          <span>{FAIL_LONG}</span>
          <button type="button" className="aui-btn aui-btn--primary aui-btn--sm" onClick={() => { for (const s of failed) void upload(s); }}>Повторить</button>
        </div>
      )}
      <div className="ph-grid">
        {cells.map(c => (
          <div key={c.key} className="ph-slot has" data-status={c.status}><img src={c.src} alt="" /></div>
        ))}
        {!full && (
          <label className="ph-slot"><span>{cells.length === 0 ? "Фото — до 4" : "+"}</span>{picker}</label>
        )}
      </div>
    </>
  );
}
