'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  PassportVisaBootstrapPayload,
  PassportVisaCountryRecord,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from '../lib/passportVisaAdminTypes.ts';
import {
  getPassportVisaAdminEditTargetCode,
  hasPassportVisaAdminCountryRedirect,
  sortPassportVisaAdminCountries,
} from '../lib/passportVisaAdminSelection.ts';
import styles from './passport-visa-admin-client-page.module.css';

const emptyCountry: PassportVisaCountryRecord = {
  mapCountryCode: '',
  englishName: '',
  chineseName: '',
  displayGroup: 'visa-required',
  rawLabel: '',
  visaFee: '',
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

export default function PassportVisaAdminClientPage() {
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
    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(themeDraft),
    });

    if (!response.ok) {
      setStatus('主题保存失败');
      return;
    }

    await refreshBootstrap();
    await refreshThemeScheme(themeDraft.id);
    setStatus('主题已保存');
  }

  async function saveThemeScheme() {
    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...themeScheme,
        activeThemeId: selectedThemeId ?? themeScheme.activeThemeId,
      }),
    });

    if (!response.ok) {
      setStatus('主题方案保存失败');
      return;
    }

    await refreshThemeScheme(selectedThemeId);
    setStatus('主题方案已保存');
  }

  async function createTheme() {
    const nextTheme = {
      ...emptyTheme,
      id: `theme-${Date.now()}`,
      label: '新主题',
    };
    const nextThemes = [...themeScheme.themes, nextTheme];
    const response = await fetch('/api/passport-visa-admin/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeThemeId: themeScheme.activeThemeId,
        themes: nextThemes,
      }),
    });

    if (!response.ok) {
      setStatus('新增主题失败');
      return;
    }

    await refreshThemeScheme(nextTheme.id);
    setStatus('主题已新增');
  }

  const activeThemeLabel = theme.label || '未命名主题';

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.statusBar}>
          <p className={styles.status}>{status}</p>
        </div>

        <div className={styles.grid}>
          <section className={`${styles.panel} ${styles.navPanel}`}>
            <h1 className={styles.panelTitle}>中国护照签证地图后台</h1>
            <div className={styles.navList}>
              {([
                { key: 'countries', title: '国家数据', meta: `${countries.length} 条` },
                { key: 'scenarios', title: '场景筛选', meta: `${scenarios.length} 组` },
                { key: 'theme', title: '地图主题', meta: activeThemeLabel },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.navButton} ${activeSection === item.key ? styles.navButtonActive : ''}`}
                  onClick={() => setActiveSection(item.key)}
                >
                  <span className={styles.navButtonTitle}>{item.title}</span>
                  <span className={styles.navButtonMeta}>{item.meta}</span>
                </button>
              ))}
            </div>
          </section>

          {activeSection === 'countries' ? (
            <>
              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.listPanel}`}>
                <div className={styles.toolbar}>
                  <input
                    className={styles.input}
                    value={countryQuery}
                    onChange={(event) => setCountryQuery(event.target.value)}
                    placeholder="按代码、中文或英文搜索"
                  />
                  <button type="button" className={styles.button} onClick={() => setSelectedCountryListCode(null)}>
                    新建国家
                  </button>
                </div>

                <div className={styles.list}>
                  {filteredCountries.map((country) => {
                    const isRedirect = hasPassportVisaAdminCountryRedirect(country.mapCountryCode);
                    return (
                      <button
                        key={country.mapCountryCode}
                        type="button"
                        className={`${styles.listButton} ${selectedCountryListCode === country.mapCountryCode ? styles.listButtonActive : ''}`}
                        onClick={() => setSelectedCountryListCode(country.mapCountryCode)}
                      >
                        <div className={styles.listTitleRow}>
                          <h3 className={styles.listTitle}>{country.chineseName}</h3>
                          {isRedirect ? <span className={styles.redirectBadge}>映射编辑</span> : null}
                        </div>
                        <p className={styles.listMeta}>
                          {country.mapCountryCode} · {country.englishName} · {getDisplayGroupLabel(country.displayGroup)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.editorPanel}`}>
                <div className={styles.editorHeading}>
                  <h2 className={styles.panelTitle}>
                    {editingCountryCode ? passportVisaCountryName(countryByCode.get(editingCountryCode)) : '新建国家'}
                  </h2>
                  <p className={styles.editorHint}>
                    {selectedCountryRedirectCode
                      ? `当前条目映射到 ${selectedCountryRedirectCode}，保存将直接更新所属主权国家记录。`
                      : '维护国家签证信息、风险说明与相关链接。'}
                  </p>
                </div>

                <div className={styles.form}>
                  <label className={styles.field}>
                    <span className={styles.label}>地图代码</span>
                    <input
                      className={styles.input}
                      value={countryDraft.mapCountryCode}
                      onChange={(event) => setCountryDraft({ ...countryDraft, mapCountryCode: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>中文名</span>
                    <input
                      className={styles.input}
                      value={countryDraft.chineseName}
                      onChange={(event) => setCountryDraft({ ...countryDraft, chineseName: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>英文名</span>
                    <input
                      className={styles.input}
                      value={countryDraft.englishName}
                      onChange={(event) => setCountryDraft({ ...countryDraft, englishName: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>签证标签</span>
                    <input
                      className={styles.input}
                      value={countryDraft.rawLabel}
                      onChange={(event) => setCountryDraft({ ...countryDraft, rawLabel: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>分组</span>
                    <select
                      className={styles.select}
                      value={countryDraft.displayGroup}
                      onChange={(event) => setCountryDraft({ ...countryDraft, displayGroup: event.target.value as PassportVisaCountryRecord['displayGroup'] })}
                    >
                      <option value="visa-free">免签</option>
                      <option value="arrival-or-evisa">落地签 / 电子签</option>
                      <option value="visa-required">需签证</option>
                      <option value="region-neutral">无数据</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>风险等级</span>
                    <select
                      className={styles.select}
                      value={countryDraft.riskLevel}
                      onChange={(event) => setCountryDraft({ ...countryDraft, riskLevel: event.target.value as PassportVisaCountryRecord['riskLevel'] })}
                    >
                      {riskLevelOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>停留时间</span>
                    <input
                      className={styles.input}
                      value={countryDraft.stayDuration}
                      onChange={(event) => setCountryDraft({ ...countryDraft, stayDuration: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>签证费用</span>
                    <input
                      className={styles.input}
                      value={countryDraft.visaFee}
                      onChange={(event) => setCountryDraft({ ...countryDraft, visaFee: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>入境居留</span>
                    <textarea
                      className={styles.textarea}
                      value={countryDraft.entryResidence}
                      onChange={(event) => setCountryDraft({ ...countryDraft, entryResidence: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>旅行风险与安全</span>
                    <textarea
                      className={styles.textarea}
                      value={countryDraft.travelRiskSafety}
                      onChange={(event) => setCountryDraft({ ...countryDraft, travelRiskSafety: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>安全注意事项</span>
                    <textarea
                      className={styles.textarea}
                      value={countryDraft.safetyPrecautions}
                      onChange={(event) => setCountryDraft({ ...countryDraft, safetyPrecautions: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>宗教法律限制</span>
                    <textarea
                      className={styles.textarea}
                      value={countryDraft.religiousLawRestrictions}
                      onChange={(event) => setCountryDraft({ ...countryDraft, religiousLawRestrictions: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>签证官网</span>
                    <input
                      className={styles.input}
                      value={countryDraft.officialVisaUrl}
                      onChange={(event) => setCountryDraft({ ...countryDraft, officialVisaUrl: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>使馆链接</span>
                    <input
                      className={styles.input}
                      value={countryDraft.embassyUrl}
                      onChange={(event) => setCountryDraft({ ...countryDraft, embassyUrl: event.target.value })}
                    />
                  </label>

                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveCountry}>保存国家</button>
                    {editingCountryCode ? (
                      <button type="button" className={styles.dangerButton} onClick={deleteCountry}>删除国家</button>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeSection === 'scenarios' ? (
            <>
              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.listPanel}`}>
                <div className={styles.toolbar}>
                  <button type="button" className={styles.button} onClick={() => setSelectedScenarioId(null)}>
                    新建场景
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
                      <div className={styles.listTitleRow}>
                        <h3 className={styles.listTitle}>{scenario.label}</h3>
                      </div>
                      <p className={styles.listMeta}>{scenario.id} · {scenario.countryCodes.length} 个国家</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.editorPanel}`}>
                <div className={styles.editorHeading}>
                  <h2 className={styles.panelTitle}>{selectedScenarioId ? scenarioDraft.label : '新建场景'}</h2>
                  <p className={styles.editorHint}>配置地图顶部的场景筛选组，使用逗号分隔国家代码。</p>
                </div>

                <div className={styles.form}>
                  <label className={styles.field}>
                    <span className={styles.label}>场景 ID</span>
                    <input
                      className={styles.input}
                      value={scenarioDraft.id}
                      onChange={(event) => setScenarioDraft({ ...scenarioDraft, id: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>场景名称</span>
                    <input
                      className={styles.input}
                      value={scenarioDraft.label}
                      onChange={(event) => setScenarioDraft({ ...scenarioDraft, label: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>国家代码列表</span>
                    <textarea
                      className={`${styles.textarea} ${styles.longTextarea}`}
                      value={scenarioDraft.countryCodes.join(', ')}
                      onChange={(event) => setScenarioDraft({
                        ...scenarioDraft,
                        countryCodes: event.target.value.split(',').map((item) => item.trim()),
                      })}
                    />
                  </label>

                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveScenario}>保存场景</button>
                    {selectedScenarioId ? (
                      <button type="button" className={styles.dangerButton} onClick={deleteScenario}>删除场景</button>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeSection === 'theme' ? (
            <>
              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.listPanel}`}>
                <div className={styles.toolbar}>
                  <button type="button" className={styles.button} onClick={createTheme}>
                    新建主题
                  </button>
                  <button type="button" className={styles.ghostButton} onClick={saveThemeScheme}>
                    保存激活主题
                  </button>
                </div>

                <div className={styles.list}>
                  {themeScheme.themes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.listButton} ${selectedThemeId === item.id ? styles.listButtonActive : ''}`}
                      onClick={() => setSelectedThemeId(item.id)}
                    >
                      <div className={styles.listTitleRow}>
                        <h3 className={styles.listTitle}>{item.label}</h3>
                        {themeScheme.activeThemeId === item.id ? <span className={styles.redirectBadge}>当前启用</span> : null}
                      </div>
                      <p className={styles.listMeta}>{item.id}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className={`${styles.panel} ${styles.fixedPanel} ${styles.editorPanel}`}>
                <div className={styles.editorHeading}>
                  <h2 className={styles.panelTitle}>{themeDraft.label || '主题编辑'}</h2>
                  <p className={styles.editorHint}>地图主色、描边色和强调色都从这里统一维护。</p>
                </div>

                <div className={styles.form}>
                  <label className={styles.field}>
                    <span className={styles.label}>主题 ID</span>
                    <input
                      className={styles.input}
                      value={themeDraft.id}
                      onChange={(event) => setThemeDraft({ ...themeDraft, id: event.target.value })}
                    />
                  </label>

                  {themeFieldOptions.map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span className={styles.label}>{field.label}</span>
                      <input
                        className={styles.input}
                        value={themeDraft[field.key]}
                        onChange={(event) => setThemeDraft({ ...themeDraft, [field.key]: event.target.value })}
                      />
                    </label>
                  ))}

                  <div className={styles.toolbar}>
                    <button type="button" className={styles.button} onClick={saveTheme}>保存主题</button>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
