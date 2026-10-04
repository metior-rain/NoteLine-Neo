import {grade} from './engine.js';
export function summarizeResult(session,{songId,difficulty,demo=false,records=[]}={}){
 const judgments=session.judgments||session.notes;
 const early=judgments.filter(n=>n.reason==='early').length;
 const hits=judgments.filter(n=>n.judged&&n.rating!=='miss'&&Number.isFinite(n.error));
 const average=hits.length?hits.reduce((sum,n)=>sum+Math.abs(n.error),0)/hits.length:null;
 const history=records.filter(r=>r.songId===songId&&r.difficulty===difficulty&&r.mode!=='demo'&&Number.isFinite(r.score));
 const best=history.length?Math.max(...history.map(r=>r.score)):null;
 return {score:session.score,grade:grade(session.score),accuracy:session.accuracy,combo:session.maxCombo,total:judgments.length,
  holds:session.notes.filter(n=>n.end!==undefined&&n.kind!=='meteor').length,meteors:judgments.filter(n=>n.kind==='meteor-checkpoint').length,bounces:session.notes.filter(n=>n.kind==='bounce').length,average,
  counts:{perfect:session.counts.perfect,great:session.counts.great,good:session.counts.good,early,miss:session.counts.miss-early},
  caption:demo?'AUTOPLAY':session.counts.miss===0?'FULL COMBO':'COMPLETE',
  best:demo?null:best,record:!demo&&(best===null||session.score>best),demo};
}
