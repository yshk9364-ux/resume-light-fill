(function(root){
 'use strict';
 const store=root.ResumeStore;
 const assets=root.ResumeSupportAssets;
 const tiers=[[1,'给作者加个油'],[3,'请作者喝瓶水'],[5,'请作者喝杯咖啡'],[10,'请作者吃个早餐'],[20,'给项目续一会儿命'],[30,'请作者吃顿简餐'],[50,'赞助一次网站适配'],[100,'超级感谢，给项目加个鸡腿']];
 let host,shadow,dialog,previousFocus;
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 function prefs(){return store.get('supportPreferences')||{};}
 function eligible(now=Date.now()){
  const p=prefs(),u=store.get('supportUsage')||{};
  return !!root.ResumePublicEdition&&!p.never&&!p.supported&&p.snoozeDate!==today()&&u.successfulWrites>=10&&now-(u.firstUsedAt||now)>=30*60000&&now-(p.lastPromptAt||0)>=7*86400000;
 }
 function close(){if(dialog)dialog.hidden=true;previousFocus?.focus?.();}
 function dismiss(choice){const p=prefs();if(choice==='today')p.snoozeDate=today();if(choice==='never')p.never=true;if(choice==='supported')p.supported=true;store.set('supportPreferences',p);close();}
 function ensure(){
  if(host)return;host=document.createElement('div');host.setAttribute('data-resume-support','');shadow=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');style.textContent=`:host{all:initial;color-scheme:light}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Microsoft Yahei",sans-serif}.backdrop{position:fixed;inset:0;background:#19251f80;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px}.panel{width:min(760px,100%);max-height:90dvh;overflow:auto;border-radius:22px;background:#faf8f2;color:#25382e;padding:28px;box-shadow:0 20px 90px #0005}.eyebrow{font-size:12px;letter-spacing:.15em;color:#8a6149}.head{display:flex;gap:12px;align-items:flex-start}.head h2{flex:1;font-size:28px;margin:8px 0}.hint{color:#657067;font-size:13px;line-height:1.7}.tier-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:20px 0}button{cursor:pointer;border:1px solid #d7dcd2;background:#fff;padding:10px;border-radius:10px;color:#25382e}button:hover,button[aria-pressed=true]{border-color:#668370;background:#eaf1e8}.tier{font-size:12px;text-align:left}.tier strong{display:block;font-size:20px;margin-bottom:4px}.payments{display:grid;grid-template-columns:1fr 1fr;gap:16px}.payment{background:white;border:1px solid #e0e3d9;border-radius:16px;padding:16px;text-align:center}.payment h3{font-size:16px;margin:0 0 10px}.payment img{width:min(220px,100%);height:auto;display:block;margin:auto}.wechat{color:#079957}.alipay{color:#1677ff}.footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.footer button{flex:1}.close{font-size:20px;padding:4px 12px}.thanks{font-size:12px;color:#66796c}[hidden]{display:none!important}@media(max-width:560px){.panel{padding:18px}.tier-grid{grid-template-columns:repeat(2,1fr)}.head h2{font-size:23px}.payments{gap:8px}.payment{padding:10px}.footer button{flex:1 1 40%}}`;
  dialog=document.createElement('div');dialog.className='backdrop';dialog.hidden=true;
  const panel=document.createElement('section');panel.className='panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','支持简历轻填');
  const text=(tag,cls,value)=>{const e=document.createElement(tag);e.className=cls||'';e.textContent=value;return e;};
  panel.append(text('div','eyebrow','RESUME LIGHT FILL · OPEN SOURCE'));
  const head=text('div','head');head.append(text('h2',null,'省下的时间，值得一点鼓励。'));const x=text('button','close','×');x.setAttribute('aria-label','关闭赞助页面');x.onclick=()=>dismiss('today');head.append(x);panel.append(head);
  panel.append(text('p','hint','如果简历轻填帮你少填了几遍表单，可以自愿支持持续维护。所有功能都可以免费使用，支持与否不影响填写。'));
  const grid=text('div','tier-grid');const selected=text('p','hint','请选择一个心意金额，也可以扫码后自定义。');
  for(const [amount,label] of tiers){const b=text('button','tier');b.append(text('strong',null,'¥'+amount),text('span',null,label));b.onclick=()=>{grid.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));selected.textContent='你的心意：¥'+amount+' · '+label+'。请在支付应用中自行输入金额。';};grid.append(b);}panel.append(grid,selected);
  const payments=text('div','payments');for(const [key,name] of [['wechat','微信支付'],['alipay','支付宝']]){const box=text('div','payment');box.append(text('h3',key,name));const img=document.createElement('img');img.src=assets[key];img.alt=name+'赞助二维码';box.append(img,text('p','hint','使用'+name+'扫一扫'));payments.append(box);}panel.append(payments);
  const footer=text('div','footer');for(const [choice,label] of [['today','今日不再提醒'],['never','以后不再提醒'],['supported','已支持，感谢']]){const b=text('button',null,label);b.onclick=()=>dismiss(choice);footer.append(b);}panel.append(footer,text('p','thanks','“已支持”是你的自主标记，插件不会读取或验证支付状态。'));
  dialog.append(panel);shadow.append(style,dialog);(document.body||document.documentElement).append(host);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dismiss('today');});shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){dismiss('today');return;}if(e.key==='Tab'){const bs=Array.from(panel.querySelectorAll('button'));const first=bs[0],last=bs.at(-1);if(e.shiftKey&&shadow.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&shadow.activeElement===last){e.preventDefault();first.focus();}}});
 }
 function show(auto=false){if(auto&&!eligible())return false;ensure();if(auto){const p=prefs();p.lastPromptAt=Date.now();store.set('supportPreferences',p);}previousFocus=document.activeElement;dialog.hidden=false;shadow.querySelector('.close').focus();return true;}
 function recordSuccess(){const now=Date.now(),u=store.get('supportUsage')||{};u.firstUsedAt ||=now;u.successfulWrites=(u.successfulWrites||0)+1;store.set('supportUsage',u);if(eligible(now))setTimeout(()=>{if(!document.querySelector('[data-resume-profile] .open'))show(true);},1200);}
 root.ResumeSupport={show,dismiss,recordSuccess,eligible,tiers};
})(globalThis);
