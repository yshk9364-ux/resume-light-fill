const fs=require('node:fs');const {JSDOM}=require('jsdom');
function boot(html,url='https://jobs.example.test/',initial={}){
 const w=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}).window;
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{width:100,height:20}];};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const mem=new Map(Object.entries(initial));let calls=0;Object.assign(w,{GM_getValue:(k,d)=>mem.has(k)?mem.get(k):d,GM_setValue:(k,v)=>mem.set(k,v),GM_deleteValue:k=>mem.delete(k),GM_listValues:()=>Array.from(mem.keys()),GM_registerMenuCommand:()=>{},GM_xmlhttpRequest:()=>{calls++;throw Error('不应自动调用 AI');}});
 const roots={};const a=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(o){const s=a.call(this,o);for(const k of ['ai','profile','panel'])if(this.hasAttribute('data-resume-'+k))roots[k]=s;return s;};
 w.eval(fs.readFileSync('userscript/dist/简历轻填.user.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,roots,get calls(){return calls;}};
}
async function settle(w,btn){for(let i=0;i<100&&btn.disabled;i++)await new Promise(r=>w.setTimeout(r,10));}
module.exports={boot,settle};
