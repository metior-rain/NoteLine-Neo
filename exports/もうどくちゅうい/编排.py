"""Deterministic phrase-based arrangement from local spectral/transient measurements."""
import json,subprocess
from pathlib import Path
import numpy as np
ROOT=Path(__file__).parent
analysis=json.loads((ROOT/'analysis/analysis.json').read_text())
f=np.load(ROOT/'analysis/features.npz');times=f['times'];onset=f['onset'];flux=f['band_flux'];bands=f['bands']
SR=22050
pcm=subprocess.check_output(['ffmpeg','-v','error','-i',analysis['audio'],'-map','0:a:0','-ac','1','-ar',str(SR),'-f','f32le','-'])
y=np.frombuffer(pcm,dtype='<f4')
BPM=140;BEAT=60000/BPM;ORIGIN=0;DURATION=analysis['duration_ms']
def ms(beat):return round(ORIGIN+beat*BEAT,3)
def feature(beat):
 t=beat*BEAT/1000;mask=abs(times-t)<.034
 if not mask.any():return np.zeros(4),0
 return flux[mask].max(axis=0),float(onset[mask].max())
def rms(beat):
 t=int(beat*BEAT/1000*SR);p=y[max(0,t):min(len(y),t+int(.1*SR))]
 return float(np.sqrt(np.mean(p*p))) if len(p) else 0
SECTIONS=[(0,8,'intro'),(8,24,'verse1'),(24,32,'build'),(32,48,'chorus1'),(48,64,'verse2'),(64,68,'bridge'),(68,92,'chorus2'),(92,96,'coda')]
def section(bar):return next(s for a,b,s in SECTIONS if a<=bar<b)
# These replace regular bar patterns; their points express a single phrase.
METEORS={'easy':[], 'normal':[19,35,51,65,75,83,91], 'hard':[11,19,29,35,45,51,59,65,71,75,83,89,91]}
BOUNCES={'easy':[39,87], 'normal':[3,7,27,39,43,55,67,79,87], 'hard':[3,7,15,23,27,39,43,47,55,63,67,73,79,87]}
MOTIFS={
 'easy':[[0,2,1,3],[1,2,0,3],[0,3,1,2],[1,3,0,2]],
 'normal':[[0,2,1,3,0,2,1,3],[1,3,0,2,1,2,0,3],[0,3,1,2,0,2,1,3],[1,2,0,3,1,3,0,2]],
 'hard':[[0,2,1,3,0,3,1,2],[1,3,0,2,1,2,0,3],[0,3,1,2,0,2,1,3],[1,2,0,3,1,3,0,2]]}
charts={};holdEvidence={}
for difficulty in ['easy','normal','hard']:
 notes=[];last=[-1e9]*4;heldUntil=[-1e9]*4;holdEvidence[difficulty]=[]
 def choose(preferred,t,additional=()):
  minimum={'easy':300,'normal':185,'hard':180}[difficulty]
  choices=[preferred,preferred^1,(preferred+2)%4,(preferred+3)%4]
  for lane in choices:
   if lane not in additional and t-heldUntil[lane]>=100 and t-last[lane]>=minimum:return lane
  raise ValueError(f'{difficulty}: revise hand pattern at {t}ms; no recovery lane')
 def add(lane,beat,end=None):
  t=ms(beat);note={'lane':lane,'time':t}
  if end is not None:note['end']=ms(end);heldUntil[lane]=note['end']
  notes.append(note);last[lane]=t;return note
 for bar in range(96):
  sec=section(bar);base=4*bar;strong=sec.startswith('chorus') or sec=='intro';motif=MOTIFS[difficulty][(bar//2)%4]
  if bar in METEORS[difficulty]:
   lanes=([0,1,0] if bar%2 else [3,2,3]) if difficulty=='normal' else ([0,1,2,1] if bar%2 else [3,2,1,2])
   offsets=[0,2,3.5] if difficulty=='normal' else [0,1,2,3.5]
   route=[{'lane':lane,'time':ms(base+b)} for lane,b in zip(lanes[1:],offsets[1:])]
   notes.append({'kind':'meteor','lane':lanes[0],'time':ms(base),'end':route[-1]['time'],'path':route})
   for lane in set(lanes):last[lane]=heldUntil[lane]=route[-1]['time']
   continue
  if bar in BOUNCES[difficulty]:
   if difficulty=='hard':offsets=[0,.5,1,1.5,2,2.5,3,3.5];lanes=[1,2,1,0,1,2,3,2]
   elif difficulty=='normal':offsets=[0,1,2,3];lanes=[1,2,1,2] if bar%2 else [2,1,2,1]
   else:offsets=[0,1,2,3];lanes=[0,1,0,1]
   route=[{'lane':lane,'time':ms(base+b)} for lane,b in zip(lanes[1:],offsets[1:])]
   notes.append({'kind':'bounce','lane':lanes[0],'time':ms(base),'end':route[-1]['time'],'path':route})
   for lane,b in zip(lanes,offsets):last[lane]=ms(base+b)
   continue
  # Independent rhythmic vocabularies, gated by measured local attacks.
  if difficulty=='easy':offsets=[0,1,2,3] if strong else ([0,2,3] if bar%2 else [0,2])
  elif difficulty=='normal':
   patterns=[[0,1,1.5,2,3,3.5],[0,.5,1,2,2.5,3],[0,1,1.5,2,2.5,3,3.5],[0,.5,1,1.5,2,3,3.5]]
   offsets=patterns[bar%4] if strong or sec=='build' else [0,1,1.5,2,3,3.5]
  else:offsets=[x/4 for x in range(16)] if strong or sec=='build' else [x/4 for x in range(16) if x%4!=3 or bar%2]
  if bar==0:offsets=[b for b in offsets if b>=.75];offsets=sorted(set(offsets+([.75] if difficulty!='easy' else [])))
  if sec=='bridge' and difficulty=='easy':offsets=[0,2]
  if sec=='coda':offsets=[b for b in offsets if b<3 or bar<95]
  # Intro's measured rapid transition at ~14.2s: six subdivisions, hard only.
  roll=difficulty=='hard' and bar==8
  if roll:offsets=sorted([b for b in offsets if not 1<=b<2]+[1+j/6 for j in range(6)])
  candidates=[]
  for b in offsets:
   band,attack=feature(base+b);quarter=abs(b-round(b))<.0001;eighth=abs(b*2-round(b*2))<.0001
   threshold=.18 if quarter else (.35 if eighth else (.55 if strong or sec=='build' else .8))
   if roll and 1<=b<2:threshold=.35
   if attack>=threshold and rms(base+b)>.015:candidates.append(b)
  # A short hold requires a measured mid-band attack followed by stable energy.
  hold=None
  if bar%3==1 or sec in ['bridge','coda']:
   eligible=[]
   for b in candidates:
    if b>2.5 or abs(b-round(b))>.001:continue
    band,attack=feature(base+b);start=(base+b)*BEAT/1000;end=(base+b+1)*BEAT/1000
    interior=(times>start+.11)&(times<end-.07)
    if not interior.any():continue
    quiet=float(np.percentile(onset[interior],80));sustain=float(np.mean(bands[interior,2]))
    if band[2]+band[1]>.9 and quiet<.65 and sustain>2.5:eligible.append((quiet,b,sustain))
   if eligible:
    quiet,b,sustain=min(eligible);hold=(b,b+1)
    holdEvidence[difficulty].append({'bar':bar+1,'beat':b,'startMs':ms(base+b),'endMs':ms(base+b+1),'interiorOnsetP80':round(quiet,3),'midBandEnergy':round(sustain,3)})
  for j,b in enumerate(candidates):
   t=ms(base+b);lane=choose(motif[j%len(motif)],t)
   add(lane,base+b,base+hold[1] if hold and b==hold[0] else None)
   band,attack=feature(base+b)
   # Accents are spread across hands; normal never stacks a chord onto a held key.
   accent=abs(b-round(b))<.001 and b in [0,2] and attack>1.0
   addChord=accent and (difficulty=='normal' and strong and bar%4==0 or difficulty=='hard' and (strong or sec=='build') and bar%2==0)
   if addChord and not any(v>t for v in heldUntil):
    other=choose((lane+2)%4,t,additional=(lane,));add(other,base+b)
 notes.sort(key=lambda n:(n['time'],n['lane']))
 charts[difficulty]={'name':'もうどくちゅうい · でんの子P / 蒼姫ラピス','bpm':BPM,'beatOffset':ORIGIN,'duration':DURATION,'notes':notes}
(ROOT/'三难度源谱.json').write_text(json.dumps({'charts':charts},ensure_ascii=False,indent=2)+'\n')
(ROOT/'编排依据.json').write_text(json.dumps({'bpm':BPM,'beatOffsetMs':ORIGIN,'durationMs':DURATION,'sections':[{'startBar':a+1,'endBar':b,'startMs':ms(a*4),'endMs':ms(b*4),'role':s} for a,b,s in SECTIONS],'holdEvidence':holdEvidence,'basis':'Signal-based beat/phrase analysis; lane patterns designed for playability, not a note-for-note vocal transcription. No human listen/playtest claimed.'},ensure_ascii=False,indent=2)+'\n')
for difficulty,c in charts.items():print(difficulty,len(c['notes']),'objects',sum(1+len(n.get('path',[])) for n in c['notes']),'judgments','holds',len(holdEvidence[difficulty]))
