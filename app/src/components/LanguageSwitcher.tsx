import { useTranslation } from 'react-i18next';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition-colors"
      title="Select language"
    >
      <option value="en">🇬🇧 EN</option>
      <option value="ru">🇷🇺 RU</option>
    </select>
  );
};
