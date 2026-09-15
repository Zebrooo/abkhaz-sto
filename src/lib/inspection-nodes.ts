// Узлы осмотра — словарь, а не данные. Восемь плиток, между которыми мастер
// выбирает при съёмке дефекта: список закрытый, одинаковый у всех сервисов и
// меняется вместе с версией приложения, поэтому живёт здесь, а не приезжает с
// сайта. С сайта приезжают формулировки дефектов внутри узла (пресеты) — вот
// они у каждого сервиса свои.
//
// Ключи — те же строки, что сайт хранит в дефекте: переименование ключа
// осиротит уже написанные отчёты, менять их нельзя.
import type { IconName } from "@/components/Icon";

export const INSPECTION_NODES = [
  { key: "brakes", name: "Тормоза", sub: "колодки, диски, шланги", icon: "wheel" },
  { key: "susp", name: "Передняя подвеска", sub: "стойки, рычаги, пыльники", icon: "cog" },
  { key: "tires", name: "Шины и диски", sub: "износ, давление, геометрия", icon: "tire" },
  { key: "engine", name: "Двигатель", sub: "утечки, ремни, свечи", icon: "car" },
  { key: "fluids", name: "Жидкости", sub: "масло, антифриз, тормозная", icon: "box" },
  { key: "steer", name: "Рулевое", sub: "рейка, тяги, наконечники", icon: "wrench" },
  { key: "elec", name: "Электрика и свет", sub: "аккумулятор, фары, ошибки", icon: "flash" },
  { key: "body", name: "Кузов и салон", sub: "коррозия, стёкла, замки", icon: "garage" },
] as const satisfies readonly { key: string; name: string; sub: string; icon: IconName }[];

export type NodeKey = (typeof INSPECTION_NODES)[number]["key"];

const BY_KEY = new Map(INSPECTION_NODES.map(n => [n.key as string, n]));

export function isNodeKey(v: unknown): v is NodeKey {
  return typeof v === "string" && BY_KEY.has(v);
}

/**
 * Имя узла для подписи. Незнакомый ключ отдаём как есть: отчёт, написанный
 * следующей версией приложения, должен читаться этой, а не ломаться.
 */
export function nodeName(key: string): string {
  return BY_KEY.get(key)?.name ?? key;
}

export function nodeIcon(key: string): IconName {
  return BY_KEY.get(key)?.icon ?? "box";
}
