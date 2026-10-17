import { faArrowsRotate, faDesktop, faDownload, faEye, faEyeSlash, faMoon, faSun, faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { useRef, useState } from 'react';
import { Icon } from '../components/icons';
import { Page, TopBar } from '../components/layout';
import { Badge, Button, Card, Field, Input, Segmented, Toggle, toast } from '../components/ui';
import { useT } from '../i18n';
import { db, saveTrip } from '../services/db';
import { listGemmaModels } from '../services/gemma';
import { DEFAULT_MODEL, setSettings, SUGGESTED_MODELS, useSettings, type Lang, type Theme } from '../services/settings';
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

  const modelChoices = models.length ? models : SUGGESTED_MODELS;

  return (
    <Page>
      <TopBar back title={t('settings.title')} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title={t('settings.gemma')} description={t('settings.api_key_hint')} className="lg:row-span-2">
          <div className="grid gap-5">
            <Field
              label={t('settings.api_key')}
              hint={
                <a className="font-medium text-foreground underline underline-offset-4" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>
              }
            >
              <div className="flex gap-2">
                <Input type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={s.apiKey} onChange={(e) => setSettings({ apiKey: e.target.value.trim() })} placeholder="AIza…" />
                <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Hide' : 'Show'}>
                  <Icon icon={showKey ? faEyeSlash : faEye} />
                </Button>
              </div>
            </Field>
            <Field label={t('settings.model')}>
              <div className="flex gap-2">
                <Input list="gemma-models" value={s.model} onChange={(e) => setSettings({ model: e.target.value.trim() || DEFAULT_MODEL })} />
                <datalist id="gemma-models">
                  {modelChoices.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <Button variant="outline" disabled={!s.apiKey || loading} icon={faArrowsRotate} onClick={loadModels} className={loading ? '[&_svg]:animate-spin' : ''}>
                  <span className="hidden sm:inline">{t('settings.list_models')}</span>
                </Button>
              </div>
            </Field>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {modelChoices.map((m) => (
                <button key={m} type="button" onClick={() => setSettings({ model: m })}>
                  <Badge variant={m === s.model ? 'default' : 'outline'} className="font-mono font-medium">
                    {m}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="border-t">
              <Toggle checked={s.thinking} onChange={(thinking) => setSettings({ thinking })} label={t('settings.thinking')} hint={t('settings.thinking_hint')} />
            </div>
          </div>
        </Card>

        <Card title={t('settings.language')}>
          <div className="grid gap-5">
            <Segmented<Lang>
              value={s.lang}
              onChange={(lang) => setSettings({ lang })}
              options={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
            />
            <Field label={t('settings.theme')}>
              <Segmented<Theme>
                value={s.theme}
                onChange={(theme) => setSettings({ theme })}
                options={[
                  { value: 'system', label: t('settings.theme_system'), icon: faDesktop },
                  { value: 'light', label: t('settings.theme_light'), icon: faSun },
                  { value: 'dark', label: t('settings.theme_dark'), icon: faMoon },
                ]}
              />
            </Field>
          </div>
        </Card>

        <Card title={t('settings.data')} description={t('settings.data_hint')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={faDownload} onClick={exportAll}>
              {t('settings.export_all')}
            </Button>
            <Button variant="outline" icon={faUpload} onClick={() => fileRef.current?.click()}>
              {t('settings.import_all')}
            </Button>
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
              variant="destructive"
              icon={faTrash}
              onClick={async () => {
                if (!confirm(t('settings.clear_confirm'))) return;
                await db.trips.clear();
                await db.images.clear();
                toast(t('done'));
              }}
            >
              {t('settings.clear_all')}
            </Button>
          </div>
        </Card>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">ChiaTiền v1.1</p>
    </Page>
  );
}
