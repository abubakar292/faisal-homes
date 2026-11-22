// Translation layer. English is complete; add Urdu strings to ur.js and set Settings → Display → language.
// The layout switches to right-to-left automatically for Urdu.
import en from './en.js';
import ur from './ur.js';

const dictionaries = { en, ur };
let lang = 'en';
export function setLanguage(l) {
  lang = dictionaries[l] ? l : 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
}
export function t(key) {
  return dictionaries[lang]?.[key] ?? en[key] ?? key;
}
