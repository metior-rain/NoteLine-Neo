// A hold makes one hit sound at its head, never at its release or completion.
export function hitSoundLane(result){
 if(!result?.note||result.rating==='miss')return null;
 return result.note.end===undefined||result.head?result.note.lane:null;
}
