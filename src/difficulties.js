import {normalizeChart,encodeScore} from './engine.js';
export const DIFFICULTIES=['easy','normal','hard'];
export const DIFFICULTY_NAMES={easy:'简单',normal:'普通',hard:'困难'};
export function normalizeCharts(charts,legacyChart){
  const source=charts||{normal:legacyChart};
  if(!source||typeof source!=='object'||Array.isArray(source))throw Error('谱面难度数据无效');
  const keys=Object.keys(source);
  if(!keys.length||keys.some(key=>!DIFFICULTIES.includes(key)||!source[key]))throw Error('谱面需要至少一档有效难度');
  const result=Object.fromEntries(keys.map(key=>[key,normalizeChart(source[key])]));
  const duration=Object.values(result)[0].duration;
  if(Object.values(result).some(chart=>Math.abs(chart.duration-duration)>1))throw Error('同一首歌的难度必须使用相同音乐时长');
  return result;
}
export function encodeCharts(charts){return Object.fromEntries(DIFFICULTIES.filter(key=>charts[key]).map(key=>[key,encodeScore(charts[key])]));}
export function firstChart(charts){return charts.normal||charts.easy||charts.hard;}
