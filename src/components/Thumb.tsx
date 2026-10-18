/* eslint-disable @next/next/no-img-element -- обложки товаров: готовые адреса
   хранилища сайта, next/image их не оптимизирует, а размеров заранее нет. */
import { Icon } from "@/components/Icon";

/** Обложка товара в карточке заказа или товара; без фото — коробка. */
export function Thumb({ src, alt, size = 56 }: { src: string | null; alt: string; size?: number }) {
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : <Icon name="box" size={Math.round(size * 0.4)} />}
    </span>
  );
}
