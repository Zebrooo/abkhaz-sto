// Минимальное описание @zebrooo/service-ticket для проверки типов без
// приватного реестра (в CI пакет ставится по NODE_AUTH_TOKEN и своими
// типами перекрывает это объявление). Сигнатура — как в abkhaz-auto
// (src/lib/bff-errors.ts): issueServiceTicket({ src, dst, privateKey }).
declare module "@zebrooo/service-ticket" {
  export const SERVICE_TICKET_HEADER: string;
  export function issueServiceTicket(input: { src: string; dst: string; privateKey: string }): string;
}
