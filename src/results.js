import {escape,icon,formatTime} from './shared.js';
import {DIFFICULTY_NAMES} from './difficulties.js';
export function initResults(root){root.innerHTML=`<div class="result-page"><header class="result-heading"><span class="result-brand">NoteLine<span> / RESULTS</span></span><span id="result-caption"></span></header><div class="result-layout"><section class="result-hero"><div class="result-song"><img id="result-cover" alt=""><div><p id="result-difficulty"></p><h1 id="result-title"></h1><p id="result-detail"></p></div></div><div class="grade-stage"><div class="grade-halo" aria-hidden="true"></div><div id="result-grade"></div><span class="grade-spark spark-one" aria-hidden="true">✦</span><span class="grade-spark spark-two" aria-hidden="true">✦</span><span class="grade-spark spark-three" aria-hidden="true">✦</span></div><span class="result-score-label">SCORE</span><div id="result-score"></div><p id="result-record"></p></section><section class="result-analysis"><div id="result-metrics"></div><div class="result-breakdown"><h2>判定分布</h2><div id="result-bar" aria-hidden="true"></div><div id="result-counts"></div></div><div class="result-timing"><span>平均击打误差<small>仅统计成功命中的音符</small></span><strong id="result-timing"></strong></div><p id="result-options"></p></section></div><footer class="result-actions"><button id="result-close" class="toolbar-button">${icon('arrow')}返回曲库</button><button id="retry" class="pill-button">再来一次${icon('restart')}</button></footer></div>`;}
export function showResults(root,summary,{song,difficulty,speed,offset}){
 const q=s=>root.querySelector(s);
 q('#result-caption').textContent=summary.caption;q('#result-grade').textContent=summary.grade;
 q('#result-title').textContent=song.name;q('#result-difficulty').textContent=DIFFICULTY_NAMES[difficulty]+(summary.demo?' · 自动演示':' · 4 KEY');
 q('#result-detail').textContent=`${formatTime(song.charts[difficulty].duration)} · ${song.charts[difficulty].bpm} BPM`;
 q('#result-cover').hidden=!song.cover;if(song.cover)q('#result-cover').src=song.cover;else q('#result-cover').removeAttribute('src');
 q('#result-score').textContent=String(summary.score).padStart(7,'0');
 q('#result-record').textContent=summary.demo?'演示成绩不计入纪录':summary.record?(summary.best===null?'首次完成 · 已建立纪录':`NEW BEST · +${summary.score-summary.best}`):`个人最佳 ${String(summary.best).padStart(7,'0')} · 本次 ${summary.score-summary.best}`;
 q('#result-record').classList.toggle('new-best',summary.record);
 q('#result-metrics').innerHTML=`<div><strong>${summary.accuracy.toFixed(2)}<small>%</small></strong><span>准确率</span></div><div><strong>${summary.combo}<small> / ${summary.total}</small></strong><span>最大连击</span></div><div><strong>${summary.total-summary.holds-(summary.meteors||0)-(summary.bounces||0)}<small> + ${summary.holds}</small></strong><span>单击 + 长按${summary.meteors||summary.bounces?` · 流星判定 ${summary.meteors} / 弹跳落点 ${summary.bounces}`:''}</span></div>`;
 q('#result-counts').innerHTML=Object.entries(summary.counts).map(([key,value])=>`<div class="count-${key}"><span><i></i>${escape(key.toUpperCase())}</span><strong>${value}</strong></div>`).join('');
 q('#result-bar').innerHTML=Object.entries(summary.counts).map(([key,value])=>`<span class="count-${key}" style="flex:${value}"></span>`).join('');
 q('#result-timing').textContent=summary.average===null?'—':`${summary.average.toFixed(1)} ms`;
 q('#result-options').textContent=`下落速度 ${speed.toFixed(1)}× · 判定偏移 ${offset>0?'+':''}${offset} ms`;
 root.querySelectorAll('.result-reveal').forEach(el=>el.classList.remove('result-reveal'));
 void root.offsetWidth;q('.grade-stage').classList.add('result-reveal');
}
