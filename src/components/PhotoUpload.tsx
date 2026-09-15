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
  file: File;
  /** blob:-адрес превью; отзывается при уходе со страницы. */
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

  async function upload(shot: Shot) {
    patch(shot.key, { status: "uploading", error: undefined });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      patch(shot.key, { status: "failed", error: "нет связи" });
      return;
    }
    try {
      const up = await createPhotoUploadAction(shot.file.type);
      if (!up.ok) throw new Error(up.error);
      const put = await fetch(up.data.uploadUrl, {
        method: "PUT",
        body: shot.file,
        headers: { "content-type": shot.file.type || "image/jpeg" },
      });
      if (!put.ok) throw new Error(`хранилище ответило ${put.status}`);
      if (defectId) {
        const att = await attachPhotoAction({ bookingId, defectId, photoId: up.data.photoId });
        if (!att.ok) throw new Error(att.error);
      }
      patch(shot.key, { status: "done", photoId: up.data.photoId });
      // Кадр уже у дефекта на сайте — просим свежую карточку, а не рисуем сами.
      if (defectId) router.refresh();
    } catch (e) {
      patch(shot.key, { status: "failed", error: e instanceof Error ? e.message : "не ушло" });
    }
  }

  function onPick(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length - shots.filter(s => s.status !== "failed").length;
    const fresh: Shot[] = Array.from(files).slice(0, Math.max(0, room)).map(file => ({
      key: ++seq, file, preview: URL.createObjectURL(file), status: "uploading",
    }));
    if (fresh.length === 0) return;
    previews.current.push(...fresh.map(s => s.preview));
    setShots(list => [...list, ...fresh]);
    for (const s of fresh) void upload(s);
    if (input.current) input.current.value = "";
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
      onChange={e => onPick(e.target.files)}
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
