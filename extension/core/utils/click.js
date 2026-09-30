function smartClick(el){
  if(!el)return;
  if(SUBMIT_DENY.test(buttonText(el)))throw new Error('已阻止整页提交或投递操作');
  try{el.scrollIntoView?.({block:'nearest',inline:'nearest'});}catch{}
  for(const type of ['pointerdown','mousedown','pointerup','mouseup']){try{el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}catch{}}
  try{el.click();}catch{try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));}catch{}}
}
