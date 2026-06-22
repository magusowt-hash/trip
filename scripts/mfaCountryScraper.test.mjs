import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCountrySections,
  parseRegionPage,
} from './mfaCountryScraper.mjs';

test('parseRegionPage extracts country names and absolute urls', () => {
  const html = `
    <div class="lm_country">亚洲</div>
    <div class="country_list">
      <ul>
        <li>
          <a href="./rb_647322/" target="_blank"><img src="./rb_647322/images/flag.gif" /></a>
          <p><a href="./rb_647322/" target="_blank">日本</a></p>
        </li>
        <li>
          <a href="./tg_647570/" target="_blank"><img src="./tg_647570/images/flag.gif" /></a>
          <p><a href="./tg_647570/" target="_blank">泰国</a></p>
        </li>
      </ul>
    </div>
  `;

  assert.deepEqual(parseRegionPage(html, 'https://cs.mfa.gov.cn/zggmcg/ljmdd/yz_645708/'), {
    regionName: '亚洲',
    countries: [
      {
        name: '日本',
        url: 'https://cs.mfa.gov.cn/zggmcg/ljmdd/yz_645708/rb_647322/',
      },
      {
        name: '泰国',
        url: 'https://cs.mfa.gov.cn/zggmcg/ljmdd/yz_645708/tg_647570/',
      },
    ],
  });
});

test('extractCountrySections returns the three requested tabs as plain text and html', () => {
  const html = `
    <dd class="text">日本</dd>
    <div id="con_a_2" style="display: none;">
      <div class="list m_mt20">
        <div class="chnlname"><span>签证入境</span></div>
        <div class="chnlnamecon">
          <div class="view_default">
            <p>第一段&nbsp;签证要求。</p>
            <p>第二段 入境流程。</p>
          </div>
        </div>
      </div>
    </div>
    <div id="con_a_7" style="display: none;">
      <div class="list m_mt20">
        <div class="chnlnamecon">
          <div class="trs_editor_view">
            <p>日本现有黄色（中风险）地区1个。</p>
            <p>请持续关注安全提醒。</p>
          </div>
        </div>
      </div>
    </div>
    <div id="con_a_3" style="display: none;">
      <div class="list m_mt20">
        <div class="chnlname"><span>社会治安</span></div>
        <div class="chnlnamecon">
          <div class="view_default">
            <p>注意防盗。</p>
            <p>谨防电信诈骗。</p>
          </div>
        </div>
      </div>
    </div>
    <div id="con_a_4" style="display: none;"></div>
  `;

  assert.deepEqual(extractCountrySections(html), {
    countryName: '日本',
    entryResidence: {
      heading: '签证入境',
      text: '第一段 签证要求。\n\n第二段 入境流程。',
      html: '<p>第一段&nbsp;签证要求。</p><p>第二段 入境流程。</p>',
    },
    travelRiskSafety: {
      heading: '旅行风险等级和安全提醒',
      text: '日本现有黄色（中风险）地区1个。\n\n请持续关注安全提醒。',
      html: '<p>日本现有黄色（中风险）地区1个。</p><p>请持续关注安全提醒。</p>',
    },
    safetyPrecautions: {
      heading: '社会治安',
      text: '注意防盗。\n\n谨防电信诈骗。',
      html: '<p>注意防盗。</p><p>谨防电信诈骗。</p>',
    },
  });
});
