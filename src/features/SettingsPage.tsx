import { useRef, useState } from 'react';
import { Page, TopBar } from '../components/layout';
import { Button, Card, Field, Input, Segmented, Toggle, toast } from '../components/ui';
import { useT } from '../i18n';
import { db, saveTrip } from '../services/db';
import { listGemmaModels } from '../services/gemma';
import { DEFAULT_MODEL, SUGGESTED_MODELS, setSettings, useSettings, type Lang, type Theme } from '../services/settings';
import { downloadFile, parseTrip } from '../services/share';

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadModels = async () => {
    setLoading(true);
    try {
      const list = await listGemmaModels(s.apiKey);
      setModels(list);
      toast(t('settings.models_loaded', { n: list.length }));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const exportAll = async () => {
    const trips = await db.trips.toArray();
    downloadFile(`chiatien-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'chiatien', version: 1, trips }, null, 2));
  };

  const importAll = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : Array.isArray(data?.trips) ? data.trips : [data];
      const parsed = list.map(parseTrip);
      for (const tr of parsed) {
        const existing = await db.trips.get(tr.id);
        // Restoring a backup of the same trip overwrites only if the backup is newer.
        if (existing && existing.updatedAt >= tr.updatedAt) continue;
        await saveTrip(tr);
      }
      toast(t('settings.imported', { n: parsed.length }));
    } catch {
      toast(t('import.invalid'));
    }
  };

  return (
    <Page>
      <TopBar back title={t('settings.title')} />
      <div className="space-y-4">
        <Card>
          <div className="space-y-3">
            <Field label={t('settings.language')}>
              <Segmented<Lang>
                value={s.lang}
                onChange={(lang) => setSettings({ lang })}
                options={[
                  { value: 'vi', label: '🇻🇳 Tiếng Việt' },
                  { value: 'en', label: '🇬🇧 English' },
                ]}
              />
            </Field>
            <Field label={t('settings.theme')}>
              <Segmented<Theme>
                value={s.theme}
                onChange={(theme) => setSettings({ theme })}
                options={[
                  { value: 'system', label: t('settings.theme_system') },
                  { value: 'light', label: `☀️ ${t('settings.theme_light')}` },
                  { value: 'dark', label: `🌙 ${t('settings.theme_dark')}` },
                ]}
              />
            </Field>
          </div>
        </Card>

        <Card title={`🤖 ${t('settings.gemma')}`}>
          <div className="space-y-3">
            <Field
              label={t('settings.api_key')}
              hint={
                <>
                  {t('settings.api_key_hint')}{' '}
                  <a className="text-teal-700 underline dark:text-teal-400" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                    aistudio.google.com/apikey ↗
                  </a>
                </>
              }
            >
              <div className="flex gap-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={s.apiKey}
                  onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
                  placeholder="AIza…"
                />
                <Button onClick={() => setShowKey(!showKey)}>{showKey ? '🙈' : '👁️'}</Button>
              </div>
            </Field>
            <Field label={t('settings.model')}>
              <div className="flex gap-2">
                <Input list="gemma-models" value={s.model} onChange={(e) => setSettings({ model: e.target.value.trim() || DEFAULT_MODEL })} />
                <datalist id="gemma-models">
                  {(models.length ? models : SUGGESTED_MODELS).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <Button disabled={!s.apiKey || loading} onClick={loadModels}>
                  {loading ? '…' : '↻'} {t('settings.list_models')}
                </Button>
              </div>
            </Field>
            <Toggle checked={s.thinking} onChange={(thinking) => setSettings({ thinking })} label={t('settings.thinking')} hint={t('settings.thinking_hint')} />
            {models.length > 0 && (
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSettings({ model: m })}
                    className={`rounded-full px-2 py-0.5 text-xs ${m === s.model ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title={`💾 ${t('settings.data')}`}>
          <p className="mb-3 text-xs text-slate-500">{t('settings.data_hint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportAll}>⬇️ {t('settings.export_all')}</Button>
            <Button onClick={() => fileRef.current?.click()}>⬆️ {t('settings.import_all')}</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importAll(f);
                e.target.value = '';
              }}
            />
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(t('settings.clear_confirm'))) return;
                await db.trips.clear();
                await db.images.clear();
                toast(t('done'));
              }}
            >
              🗑️ {t('settings.clear_all')}
            </Button>
          </div>
        </Card>
        <p className="text-center text-xs text-slate-400">ChiaTiền v1.0</p>
      </div>
    </Page>
  );
}
