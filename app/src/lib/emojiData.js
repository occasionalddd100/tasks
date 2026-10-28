// every emoji with its Russian name and tags (emojibase), loaded only when the emoji picker opens
import data from "emojibase-data/ru/compact.json";

export const GROUPS = [[0, "😀", "Смайлы"], [1, "👋", "Люди"], [3, "🐱", "Природа"], [4, "🍕", "Еда"], [5, "✈️", "Места"], [6, "⚽", "Занятия"], [7, "💡", "Предметы"], [8, "❤️", "Символы"], [9, "🏳️", "Флаги"]];
export const EMOJIS = data.filter(e => e.group !== 2 && e.group != null).sort((a, b) => a.order - b.order)
  .map(e => ({ u: e.unicode, g: e.group, s: (e.label + " " + (e.tags || []).join(" ")).toLowerCase() }));
// words people search with that emojibase doesn't use
export const SYN = { рулетка: "азарт", ставки: "азарт", казино: "азарт", шмот: "одежда", спортзал: "спорт", качалка: "спорт", учеба: "книг", учёба: "книг", работа: "портфель", крипта: "деньги", аниме: "япон", кино: "фильм", сериал: "телевизор" };
