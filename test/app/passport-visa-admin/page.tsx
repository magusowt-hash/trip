'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  PassportVisaBootstrapPayload,
  PassportVisaCountryRecord,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from '../../lib/passportVisaAdminTypes';
import {
  getPassportVisaAdminEditTargetCode,
  hasPassportVisaAdminCountryRedirect,
  sortPassportVisaAdminCountries,
} from '../../lib/passportVisaAdminSelection';
import styles from './page.module.css';

const emptyCountry: PassportVisaCountryRecord = {
  mapCountryCode: '',
  englishName: '',
  chineseName: '',
  displayGroup: 'visa-required',
  rawLabel: '',
  visaFee: '',
  visaRequirement: '',
  stayDuration: '',
  officialVisaUrl: '',
  embassyUrl: '',
  entryResidence: '',
  travelRiskSafety: '',
  safetyPrecautions: '',
  religiousLawRestrictions: '',
  riskLevel: '低风险',
};

const emptyScenario: PassportVisaScenarioRecord = {
  id: '',
  label: '',
  countryCodes: [],
};

const emptyTheme: PassportVisaThemeRecord & { id: string } = {
  id: '',
  label: '',
  visaFree: '#D4A52A',
  arrivalOrEVisa: '#F0DEBF',
  visaRequired: '#8B5E3C',
  noData: '#F4F3F0',
  stroke: '#FFFDF9',
  accentStrong: '#6F4B2F',
};

const themeFieldOptions = [
  { key: 'label', label: '主题名称' },
  { key: 'visaFree', label: '免签颜色' },
  { key: 'arrivalOrEVisa', label: '落地签 / 电子签颜色' },
  { key: 'visaRequired', label: '需签证颜色' },
  { key: 'noData', label: '无数据颜色' },
  { key: 'stroke', label: '描边颜色' },
  { key: 'accentStrong', label: '强调色' },
] as const;

const riskLevelOptions = [
  { value: '低风险', label: '低' },
  { value: '中风险', label: '中' },
  { value: '高风险', label: '高' },
  { value: '请勿前往', label: '请勿前往' },
] as const;

type AdminSection = 'countries' | 'scenarios' | 'theme';

function getDisplayGroupLabel(displayGroup: PassportVisaCountryRecord['displayGroup']) {
  if (displayGroup === 'visa-free') return '免签';
  if (displayGroup === 'arrival-or-evisa') return '落地签 / 电子签';
  if (displayGroup === 'visa-required') return '需签证';
  return '无数据';
}

function passportVisaCountryName(country: PassportVisaCountryRecord | undefined) {
  if (!country) {
    return '未知所属国';
  }

  return `${country.chineseName} · ${country.englishName}`;
}

export default function PassportVisaAdminPage() {
  const [countries, setCountries] = useState<PassportVisaCountryRecord[]>([]);
  const [scenarios, setScenarios] = useState<PassportVisaScenarioRecord[]>([]);
  const [theme, setTheme] = useState<PassportVisaThemeRecord>(emptyTheme);
  const [themeScheme, setThemeScheme] = useState<PassportVisaThemeSchemeRecord>({ activeThemeId: 'default', themes: [] });
  const [activeSection, setActiveSection] = useState<AdminSection>('countries');
  const [selectedCountryListCode, setSelectedCountryListCode] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [countryDraft, setCountryDraft] = useState<PassportVisaCountryRecord>(emptyCountry);
  const [scenarioDraft, setScenarioDraft] = useState<PassportVisaScenarioRecord>(emptyScenario);
  const [themeDraft, setThemeDraft] = useState<PassportVisaThemeRecord & { id: string }>(emptyTheme);
  const [countryQuery, setCountryQuery] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/passport-visa/bootstrap')
      .then((response) => response.json() as Promise<PassportVisaBootstrapPayload>)
      .then((payload) => {
        setCountries(payload.countries);
        setScenarios(payload.scenarios);
        setTheme(payload.theme);
      })
      .catch(() => {
        setStatus('初始化数据加载失败');
      });
  }, []);

  useEffect(() => {
    fetch('/api/passport-visa-admin/theme')
      .then((response) => response.json() as Promise<PassportVisaThemeSchemeRecord>)
      .then((payload) => {
        setThemeScheme(payload);
        setSelectedThemeId(payload.activeThemeId);
      })
      .catch(() => {
        setStatus('主题方案加载失败');
      });
  }, []);

  const countryByCode = useMemo(
    () => new Map(countries.map((country) => [country.mapCountryCode, country])),
    [countries],
  );

  const editingCountryCode = useMemo(
    () => getPassportVisaAdminEditTargetCode(selectedCountryListCode),
    [selectedCountryListCode],
  );

  const selectedCountryRedirectCode = useMemo(() => {
    if (!hasPassportVisaAdminCountryRedirect(selectedCountryListCode)) {
      return null;
    }

    return editingCountryCode;
  }, [editingCountryCode, selectedCountryListCode]);

  useEffect(() => {
    const selected = editingCountryCode ? countryByCode.get(editingCountryCode) : null;
    setCountryDraft(selected ? { ...selected } : emptyCountry);
  }, [countryByCode, editingCountryCode]);

  useEffect(() => {
    const selected = scenarios.find((item) => item.id === selectedScenarioId);
    setScenarioDraft(selected ? { ...selected, countryCodes: [...selected.countryCodes] } : emptyScenario);
  }, [scenarios, selectedScenarioId]);

  useEffect(() => {
    const selected = themeScheme.themes.find((item) => item.id === selectedThemeId);
    if (selected) {
      setThemeDraft({ ...selected });
    }
  }, [themeScheme, selectedThemeId]);

  const filteredCountries = useMemo(() => {
    const normalized = countryQuery.trim().toLowerCase();
    const matchedCountries = !normalized ? countries : countries.filter((country) => (
      country.mapCountryCode.toLowerCase().includes(normalized)
      || country.chineseName.toLowerCase().includes(normalized)
      || country.englishName.toLowerCase().includes(normalized)
    ));

    return sortPassportVisaAdminCountries(matchedCountries);
  }, [countries, countryQuery]);

  async function refreshBootstrap() {
    const response = await fetch('/api/passport-visa/bootstrap', { cache: 'no-store' });
    const payload = await response.json() as PassportVisaBootstrapPayload;
    setCountries(payload.countries);
    setScenarios(payload.scenarios);
    setTheme(payload.theme);
  }

  async function refreshThemeScheme(preferredThemeId?: string | null) {
    const response = await fetch('/api/passport-visa-admin/theme', { cache: 'no-store' });
    const payload = await response.json() as PassportVisaThemeSchemeRecord;
    setThemeScheme(payload);
    setSelectedThemeId(
      preferredThemeId && payload.themes.some((item) => item.id === preferredThemeId)
        ? preferredThemeId
        : payload.activeThemeId,
    );
  }

  async function saveCountry() {
    const isCreate = !editingCountryCode;
    const url = isCreate
      ? '/api/passport-visa-admin/countries'
      : `/api/passport-visa-admin/countries/${editingCountryCode}`;
    const method = isCreate ? 'POST' : 'PUT';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(countryDraft),
    });

    if (!response.ok) {
      setStatus('国家保存失败');
      return;
    }

    setSelectedCountryListCode((current) => (current ? current : countryDraft.mapCountryCode));
    await refreshBootstrap();
    setStatus('国家已保存');
  }

  async function deleteCountry() {
    if (!editingCountryCode) return;
    const response = await fetch(`/api/passport-visa-admin/countries/${editingCountryCode}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      setStatus('国家删除失败');
      return;
    }

    setSelectedCountryListCode(null);
    await refreshBootstrap();
    setStatus('国家已删除');
  }

  async function saveScenario() {
    const isCreate = !selectedScenarioId;
    const url = isCreate
      ? '/api/passport-visa-admin/scenarios'
      : `/api/passport-visa-admin/scenarios/${selectedScenarioId}`;
    const method = isCreate ? 'POST' : 'PUT';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...scenarioDraft,
        countryCodes: scenarioDraft.countryCodes.filter(Boolean),
      }),
    });

    if (!response.ok) {
      setStatus('场景保存失败');
      return;
    }

    setSelectedScenarioId(scenarioDraft.id);
    await refreshBootstrap();
    setStatus('场景已保存');
  }

  async function deleteScenario() {
    if (!selectedScenarioId) return;
    const response = await fetch(`/api/passport-visa-admin/scenarios/${selectedScenarioId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      setStatus('场景删除失败');
      return;
    }

    setSelectedScenarioId(null);
    await refreshBootstrap();
    setStatus('场景已删除');
  }

  async function saveTheme() {
    const nextThemes = themeScheme.themes.some((item) => item.id === themeDraft.id)
      ? themeScheme.themes.map((item) => (item.id === themeDraft.id ? { ...themeDraft, id: themeDraft.id ?? '' } : item))
      : [...themeScheme.themes, { ...themeDraft, id: themeDraft.id ?? '' }];
    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeThemeId: themeScheme.activeThemeId,
        themes: nextThemes,
      }),
    });

    if (!response.ok) {
      setStatus('主题保存失败');
      return;
    }

    await refreshThemeScheme(themeDraft.id ?? null);
    await refreshBootstrap();
    setStatus('主题已保存');
  }

  async function activateTheme(themeId: string) {
    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeThemeId: themeId,
        themes: themeScheme.themes,
      }),
    });

    if (!response.ok) {
      setStatus('启用主题失败');
      return;
    }

    await refreshThemeScheme(themeId);
    await refreshBootstrap();
    setStatus('当前使用方案已更新');
  }

  async function deleteTheme() {
    if (!selectedThemeId) return;
    if (themeScheme.themes.length <= 1) {
      setStatus('至少保留一套主题方案');
      return;
    }
    if (selectedThemeId === themeScheme.activeThemeId) {
      setStatus('请先切换当前使用方案');
      return;
    }

    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeThemeId: themeScheme.activeThemeId,
        themes: themeScheme.themes.filter((item) => item.id !== selectedThemeId),
      }),
    });

    if (!response.ok) {
      setStatus('删除主题失败');
      return;
    }

    await refreshThemeScheme(null);
    setStatus('主题已删除');
  }

  function createThemeCopy() {
    const source = themeDraft.id ? themeDraft : theme;
    const timestamp = Date.now().toString(36);
    const nextTheme = {
      ...source,
      id: `theme-${timestamp}`,
      label: `${source.label || '新主题'} 副本`,
    };
    setThemeScheme((current) => ({
      ...current,
      themes: [...current.themes, nextTheme as PassportVisaThemeRecord & { id: string }],
    }));
    setSelectedThemeId(nextTheme.id ?? null);
    setThemeDraft(nextTheme);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.statusBar}>
          <div className={styles.status}>{status}</div>
        </div>

        <div className={styles.grid}>
          <aside className={`${styles.panel} ${styles.navPanel}`}>
            <h2 className={styles.panelTitle}>导航</h2>
            <div className={styles.navList}>
              <button
                type="button"
                className={`${styles.navButton} ${activeSection === 'countries' ? styles.navButtonActive : ''}`}
                onClick={() => setActiveSection('countries')}
              >
                <span className={styles.navButtonTitle}>地区</span>
                <span className={styles.navButtonMeta}>{countries.length} 条</span>
              </button>
              <button
                type="button"
                className={`${styles.navButton} ${activeSection === 'scenarios' ? styles.navButtonActive : ''}`}
                onClick={() => setActiveSection('scenarios')}
              >
                <span className={styles.navButtonTitle}>持签场景</span>
                <span className={styles.navButtonMeta}>{scenarios.length} 条</span>
              </button>
              <button
                type="button"
                className={`${styles.navButton} ${activeSection === 'theme' ? styles.navButtonActive : ''}`}
                onClick={() => setActiveSection('theme')}
              >
                <span className={styles.navButtonTitle}>主题颜色</span>
                <span className={styles.navButtonMeta}>{theme.label || '未命名主题'}</span>
              </button>
            </div>
          </aside>

          <section className={`${styles.panel} ${styles.fixedPanel} ${styles.listPanel}`}>
            {activeSection === 'countries' ? (
              <>
                <h2 className={styles.panelTitle}>地区列表</h2>
                <div className={styles.toolbar}>
                  <input
                    className={styles.input}
                    placeholder="搜索地区 / code"
                    value={countryQuery}
                    onChange={(event) => setCountryQuery(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => {
                      setSelectedCountryListCode(null);
                      setCountryDraft(emptyCountry);
                    }}
                  >
                    新增地区
                  </button>
                </div>
                <div className={styles.list}>
                  {filteredCountries.map((country) => (
                    <button
                      key={country.mapCountryCode}
                      type="button"
                      className={`${styles.listButton} ${selectedCountryListCode === country.mapCountryCode ? styles.listButtonActive : ''}`}
                      onClick={() => setSelectedCountryListCode(country.mapCountryCode)}
                    >
                      <div className={styles.listTitleRow}>
                        <p className={styles.listTitle}>{country.chineseName} · {country.englishName}</p>
                        {hasPassportVisaAdminCountryRedirect(country.mapCountryCode) ? (
                          <span className={styles.redirectBadge}>
                            → {passportVisaCountryName(countryByCode.get(getPassportVisaAdminEditTargetCode(country.mapCountryCode) ?? ''))}
                          </span>
                        ) : null}
                      </div>
                      <p className={styles.listMeta}>{country.mapCountryCode} · {getDisplayGroupLabel(country.displayGroup)}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {activeSection === 'scenarios' ? (
              <>
                <h2 className={styles.panelTitle}>场景列表</h2>
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => {
                      setSelectedScenarioId(null);
                      setScenarioDraft(emptyScenario);
                    }}
                  >
                    新增场景
                  </button>
                </div>
                <div className={styles.list}>
                  {scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      className={`${styles.listButton} ${selectedScenarioId === scenario.id ? styles.listButtonActive : ''}`}
                      onClick={() => setSelectedScenarioId(scenario.id)}
                    >
                      <p className={styles.listTitle}>{scenario.label}</p>
                      <p className={styles.listMeta}>{scenario.id} · {scenario.countryCodes.length} countries</p>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {activeSection === 'theme' ? (
              <>
                <h2 className={styles.panelTitle}>主题方案</h2>
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={createThemeCopy}
                  >
                    新增方案
                  </button>
                </div>
                <div className={styles.list}>
                  {themeScheme.themes.map((themeOption) => (
                    <button
                      key={themeOption.id}
                      type="button"
                      className={`${styles.listButton} ${selectedThemeId === themeOption.id ? styles.listButtonActive : ''}`}
                      onClick={() => setSelectedThemeId(themeOption.id)}
                    >
                      <p className={styles.listTitle}>{themeOption.label}</p>
                      <p className={styles.listMeta}>{themeScheme.activeThemeId === themeOption.id ? '当前使用' : themeOption.id}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className={`${styles.panel} ${styles.fixedPanel} ${styles.editorPanel}`}>
            {activeSection === 'countries' ? (
              <>
                <div className={styles.editorHeading}>
                  <h2 className={styles.panelTitle}>{selectedCountryRedirectCode ? '所属国编辑' : '地区编辑'}</h2>
                  {selectedCountryRedirectCode && selectedCountryListCode ? (
                    <p className={styles.editorHint}>
                      {passportVisaCountryName(countryByCode.get(selectedCountryListCode))} ({selectedCountryListCode})
                      {' → '}
                      {passportVisaCountryName(countryByCode.get(selectedCountryRedirectCode))} ({selectedCountryRedirectCode})
                    </p>
                  ) : null}
                </div>
                <div className={styles.form}>
                  <div className={styles.twoCol}>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>地区代码</label>
                      <input className={styles.input} value={countryDraft.mapCountryCode} onChange={(event) => setCountryDraft((current) => ({ ...current, mapCountryCode: event.target.value.toUpperCase() }))} />
                    </div>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>签证类型</label>
                      <select className={styles.select} value={countryDraft.displayGroup} onChange={(event) => setCountryDraft((current) => ({ ...current, displayGroup: event.target.value as PassportVisaCountryRecord['displayGroup'] }))}>
                        <option value="visa-free">免签</option>
                        <option value="arrival-or-evisa">落地签 / 电子签</option>
                        <option value="visa-required">需签证</option>
                        <option value="region-neutral">无数据</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.twoCol}>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>中文名</label>
                      <input className={styles.input} value={countryDraft.chineseName} onChange={(event) => setCountryDraft((current) => ({ ...current, chineseName: event.target.value }))} />
                    </div>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>英文名</label>
                      <input className={styles.input} value={countryDraft.englishName} onChange={(event) => setCountryDraft((current) => ({ ...current, englishName: event.target.value }))} />
                    </div>
                  </div>
                  <div className={styles.twoCol}>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>签证名称</label>
                      <input className={styles.input} value={countryDraft.rawLabel} onChange={(event) => setCountryDraft((current) => ({ ...current, rawLabel: event.target.value }))} />
                    </div>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>风险分组</label>
                      <div className={styles.riskLevelGrid}>
                        {riskLevelOptions.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            className={`${styles.riskLevelButton} ${countryDraft.riskLevel === value ? styles.riskLevelButtonActive : ''}`}
                            onClick={() => setCountryDraft((current) => ({ ...current, riskLevel: value }))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>签证要求</label>
                    <textarea className={styles.textarea} value={countryDraft.visaRequirement} onChange={(event) => setCountryDraft((current) => ({ ...current, visaRequirement: event.target.value }))} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>入境居留</label>
                    <textarea
                      className={`${styles.textarea} ${styles.longTextarea}`}
                      value={countryDraft.entryResidence}
                      onChange={(event) => setCountryDraft((current) => ({ ...current, entryResidence: event.target.value }))}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>旅行风险等级和安全提醒</label>
                    <textarea
                      className={`${styles.textarea} ${styles.longTextarea}`}
                      value={countryDraft.travelRiskSafety}
                      onChange={(event) => setCountryDraft((current) => ({ ...current, travelRiskSafety: event.target.value }))}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>安全防范</label>
                    <textarea
                      className={`${styles.textarea} ${styles.longTextarea}`}
                      value={countryDraft.safetyPrecautions}
                      onChange={(event) => setCountryDraft((current) => ({ ...current, safetyPrecautions: event.target.value }))}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>教法约束</label>
                    <textarea
                      className={`${styles.textarea} ${styles.longTextarea}`}
                      value={countryDraft.religiousLawRestrictions}
                      onChange={(event) => setCountryDraft((current) => ({ ...current, religiousLawRestrictions: event.target.value }))}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>官方签证网址</label>
                    <input className={styles.input} value={countryDraft.officialVisaUrl} onChange={(event) => setCountryDraft((current) => ({ ...current, officialVisaUrl: event.target.value }))} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>使馆网址</label>
                    <input className={styles.input} value={countryDraft.embassyUrl} onChange={(event) => setCountryDraft((current) => ({ ...current, embassyUrl: event.target.value }))} />
                  </div>
                  <div className={styles.twoCol}>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>停留信息</label>
                      <input className={styles.input} value={countryDraft.stayDuration} onChange={(event) => setCountryDraft((current) => ({ ...current, stayDuration: event.target.value }))} />
                    </div>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>签证费</label>
                      <input className={styles.input} value={countryDraft.visaFee} onChange={(event) => setCountryDraft((current) => ({ ...current, visaFee: event.target.value }))} />
                    </div>
                  </div>
                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveCountry}>保存地区</button>
                    <button type="button" className={styles.dangerButton} onClick={deleteCountry}>删除地区</button>
                  </div>
                </div>
              </>
            ) : null}

            {activeSection === 'scenarios' ? (
              <>
                <h2 className={styles.panelTitle}>场景编辑</h2>
                <div className={styles.form}>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>场景 ID</label>
                    <input className={styles.input} value={scenarioDraft.id} onChange={(event) => setScenarioDraft((current) => ({ ...current, id: event.target.value }))} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>场景名称</label>
                    <input className={styles.input} value={scenarioDraft.label} onChange={(event) => setScenarioDraft((current) => ({ ...current, label: event.target.value }))} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.label}>地区代码列表</label>
                    <textarea
                      className={`${styles.textarea} ${styles.scenarioCodes}`}
                      value={scenarioDraft.countryCodes.join(', ')}
                      onChange={(event) => setScenarioDraft((current) => ({
                        ...current,
                        countryCodes: event.target.value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
                      }))}
                    />
                  </div>
                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveScenario}>保存场景</button>
                    <button type="button" className={styles.dangerButton} onClick={deleteScenario}>删除场景</button>
                  </div>
                </div>
              </>
            ) : null}

            {activeSection === 'theme' ? (
              <>
                <h2 className={styles.panelTitle}>主题编辑</h2>
                <div className={styles.form}>
                  <div className={styles.twoCol}>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>主题名称</label>
                      <input
                        className={styles.input}
                        value={themeDraft.label}
                        onChange={(event) => setThemeDraft((current) => ({ ...current, label: event.target.value }))}
                      />
                    </div>
                    <div className={styles.fieldRow}>
                      <label className={styles.label}>当前使用方案</label>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => themeDraft.id ? activateTheme(themeDraft.id) : null}
                      >
                        {themeDraft.id === themeScheme.activeThemeId ? '已启用' : '设为当前使用方案'}
                      </button>
                    </div>
                  </div>
                  <div className={styles.themeEditorGrid}>
                    {themeFieldOptions.filter((field) => field.key !== 'label').map((field) => (
                      <div key={field.key} className={styles.themeEditorCard}>
                        <label className={styles.label}>{field.label}</label>
                        <input
                          className={styles.input}
                          value={themeDraft[field.key]}
                          onChange={(event) => setThemeDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                        />
                        <div className={styles.themeSwatch} style={{ background: themeDraft[field.key] }} />
                      </div>
                    ))}
                  </div>
                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveTheme}>保存主题</button>
                    <button type="button" className={styles.dangerButton} onClick={deleteTheme}>删除主题</button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
