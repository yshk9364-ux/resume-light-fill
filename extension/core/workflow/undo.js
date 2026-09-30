function undo(){
 let restored=0,skipped=0;
 for(const r of undoStack.reverse())try{
  if(r.kind==='radioGroup'){
   if(!r.chosen?.isConnected||!r.chosen.checked){skipped++;continue;}
   for(const p of r.peersBefore)if(p.el.isConnected)setNative(p.el,p.before);restored++;
  }else if(r.kind==='checkbox'||r.kind==='native'){
   if(!r.el.isConnected||(r.kind==='checkbox'?r.el.checked:r.el.value)!==r.after){skipped++;continue;}
   setNative(r.el,r.before);restored++;
  }else if(r.kind==='contentEditable'){
   if(!r.el.isConnected||read({kind:'contentEditable',el:r.el})!==r.after){skipped++;continue;}
   r.el.textContent=r.before;r.el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:r.before}));restored++;
  }else skipped++;
 }catch{skipped++;}
 undoStack=[];return {restored,skipped};
}
