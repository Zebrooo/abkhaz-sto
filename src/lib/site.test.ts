import { describe, expect, it } from "vitest";
import { shopStorefrontUrl } from "./site";

// Ссылка «Открыть витрину на сайте» ведёт в редактор витрины, и у него ключ
// вкладки и параметр в адресе РАЗНЫЕ: ключ `listings`, параметр `obyavleniya`
// (abkhaz-auto, src/app/lk/magaziny/[id]/vitrina/page.tsx, editorTabs).
// Разбор неизвестного значения там молча возвращает «Основные», то есть
// ошибка в параметре не падает, а тихо уводит владельца не туда — 16.09.2026
// он из-за этого решил, что добавленный товар не появился на витрине.
describe("ссылка на витрину сайта", () => {
  it("ведёт на вкладку объявлений параметром obyavleniya, а не ключом listings", () => {
    const url = shopStorefrontUrl(26);
    expect(url).toContain("/lk/magaziny/26/vitrina");
    expect(url).toContain("tab=obyavleniya");
    expect(url).not.toContain("tab=listings");
  });
});
