import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/ui';
import { AssistantPage } from './features/AssistantPage';
import { ExpenseEditor } from './features/expense/ExpenseEditor';
import { ImportPage } from './features/ImportPage';
import { SettingsPage } from './features/SettingsPage';
import { TripPage } from './features/trip/TripPage';
import { TripsPage } from './features/TripsPage';
import { applyTheme, useSettings } from './services/settings';

export default function App() {
  const { theme, lang } = useSettings();
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TripsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/trip/:tripId" element={<TripPage />} />
        <Route path="/trip/:tripId/expense/:expenseId" element={<ExpenseEditor />} />
        <Route path="*" element={<TripsPage />} />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
