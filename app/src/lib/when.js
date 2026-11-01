import { today, addDays } from "@/lib/tasks";

// Words in a task's text that set its date (and time): «сегодня», «завтра», «послезавтра», «в пятницу»,
// «через 3 дня», «через неделю», «12.11», «12 ноября», plus «в 14:30». The words are taken out of the text.
// `marks` are [start, end) ranges in the typed text, for highlighting while typing.
const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const DAYS = [["воскресенье", "вс"], ["понедельник", "пн"], ["вторник", "вт"], ["сред", "ср"], ["четверг", "чт"], ["пятниц", "пт"], ["суббот", "сб"]];
const L = "[^0-9a-zа-яё]"; // what may stand next to a word
const iso = d => d.toLocaleDateString("sv-SE");

const RULES = [
  [/(послезавтра)/, () => addDays(2)],
  [/(сегодня|сёдня)/, () => today()],
  [/(завтра)/, () => addDays(1)],
  [/через\s+(\d{1,3})\s+(?:дн|день|дня|дней)/, m => addDays(+m[1])],
  [/через\s+неделю/, () => addDays(7)],
  [/через\s+(\d{1,2})\s+недел[иья]/, m => addDays(7 * +m[1])],
  [/(?:во?\s+)?(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)/, m => {
    const w = DAYS.findIndex(([full]) => m[1].startsWith(full)), d = new Date();
    let n = (w - d.getDay() + 7) % 7; if (n === 0) n = 7;
    return addDays(n);
  }],
  [/(\d{1,2})\.(\d{2})(?:\.(\d{2,4}))?/, m => date(+m[1], +m[2], m[3])],
  [/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/, m => date(+m[1], MONTHS.findIndex(x => m[2].startsWith(x)) + 1, m[3])],
];
function date(d, mo, y) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return "";
  const now = new Date();
  let year = y ? (+y < 100 ? 2000 + +y : +y) : now.getFullYear();
  let x = new Date(year, mo - 1, d, 12);
  if (x.getMonth() !== mo - 1) return "";
  // a day already past this year means next year
  if (!y && iso(x) < today()) x = new Date(year + 1, mo - 1, d, 12);
  return iso(x);
}
const TIME = new RegExp(`(^|${L})(в\\s+)?([01]?\\d|2[0-3])[:.]([0-5]\\d)(?=$|${L})`, "i");

export function parseWhen(raw) {
  let due = "", time = "", marks = [];
  const low = raw.toLowerCase();
  for (const [re, f] of RULES) {
    const m = new RegExp(`(^|${L})(${re.source})(?=$|${L})`, "i").exec(low);
    if (!m) continue;
    const inner = re.exec(m[2]); const v = inner && f(inner);
    if (!v) continue;
    const start = m.index + m[1].length;
    due = v; marks.push([start, start + m[2].length]);
    break;
  }
  const t = TIME.exec(low);
  // «12.11» is a date, not a time: only take a time that does not overlap the date
  if (t) {
    const start = t.index + t[1].length, end = start + t[0].length - t[1].length;
    if (!marks.some(([a, b]) => start < b && end > a)) { time = t[3].padStart(2, "0") + ":" + t[4]; marks.push([start, end]); }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let text = raw;
  for (const [a, b] of [...marks].reverse()) text = text.slice(0, a) + text.slice(b);
  text = text.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return { text: text || raw.trim(), due, time, marks };
}
