// What changed, newest first: public/changelog.json (also served next to the site, so an open page
// can read what a newer build brings). A new entry on top shows once as «Что нового» after the app updates.
import data from "../../public/changelog.json";
export const CHANGELOG = data;
export const LATEST = CHANGELOG[0].id;
