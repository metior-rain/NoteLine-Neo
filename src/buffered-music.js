import {resumeAudio,decodeAudio} from './audio-compat.js';
// Decode before countdown; gameplay reads the same audio clock used for playback.
export class BufferedMusic {
  constructor(getContext){this.getContext=getContext;this.buffer=null;this.source=null;this.position=0;this.startedAt=0;this.level=1;this.generation=0;this.playToken=0;this.cachedBlob=null;this.cachedBuffer=null;}
  unlock(){return resumeAudio(this.getContext());}
  async prepare(blob){
    const generation=++this.generation;this.pause();this.position=0;
    const context=this.getContext();this.context=context;
    if(!this.gain){this.gain=context.createGain();this.gain.connect(context.destination);}
    const buffer=blob===this.cachedBlob?this.cachedBuffer:await decodeAudio(context,await blob.arrayBuffer());
    if(generation!==this.generation)return false;
    this.buffer=buffer;this.cachedBlob=blob;this.cachedBuffer=buffer;this.volume=this.level;return true;
  }
  get duration(){return this.buffer?.duration||0;}
  get currentTime(){return Math.min(this.duration,this.source?this.position+this.context.currentTime-this.startedAt:this.position);}
  set currentTime(value){const playing=!!this.source;this.pause();this.position=Math.max(0,Math.min(this.duration,value));if(playing)this.play();}
  get volume(){return this.level;}
  set volume(value){this.level=value;if(this.gain)this.gain.gain.setValueAtTime(value,this.context.currentTime);}
  async play(){
    if(this.source)return;if(!this.buffer)throw Error('音乐尚未加载');
    const generation=this.generation,token=++this.playToken;if(this.context.state!=='running'){try{await resumeAudio(this.context);}catch(error){if(generation!==this.generation||token!==this.playToken)return;throw error;}}
    if(generation!==this.generation||token!==this.playToken)return;
    const source=this.context.createBufferSource();source.buffer=this.buffer;source.connect(this.gain);this.source=source;this.startedAt=this.context.currentTime;
    source.onended=()=>{if(this.source!==source)return;this.source=null;this.position=this.duration;source.disconnect();this.onended?.();};
    source.start(0,this.position);
  }
  pause(){this.playToken++;if(!this.source)return;this.position=this.currentTime;const source=this.source;this.source=null;source.onended=null;source.stop();source.disconnect();}
  clear(){this.generation++;this.pause();this.buffer=null;this.position=0;}
}
