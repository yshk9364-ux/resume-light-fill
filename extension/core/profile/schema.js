/* Public schema and conservative scoring. Storage keys are retained for compatibility. */
(()=>{
 const core=globalThis.ResumeCore;
 const rename={basics:'personal',projects:'project',computerSkills:'computerSkill',professionalSkills:'skill',languages:'language',awards:'award',certificates:'certificate'};
 const fields={birthday:'birthDate',political:'politicalStatus',start:'startDate',end:'endDate',useTime:'duration'};
 const extra={company:['单位','雇主','Employer','Company'],start:['起始时间','任职时间','工作开始时间','实习开始时间','From Date','Start Date'],end:['终止时间','任职结束时间','实习结束时间','To Date','End Date'],title:['Position','Job Title'],description:['Job Description'],school:['School','University'],degree:['Degree'],major:['Major']};
 const schema=[];
 for(const [group,defs] of [['basics',core.basics],...Object.entries(core.groups).map(([g,d])=>[g,d.fields])])for(const [field,label,aliases] of defs){
  const canonical=(rename[group]||group)+(group==='basics'?'.':'[].')+(fields[field]||field);
  const additions=[...(extra[field]||[])];
  if(field==='start')additions.push('开始年份','开始月份','开始日','入学年份','入学月份','Start Year','Start Month','Start Day');
  if(field==='end')additions.push('结束年份','结束月份','结束日','毕业年份','毕业月份','End Year','End Month','End Day');
  if(field==='birthday')additions.push('出生年份','出生月份','出生日期中的日','Birth Year','Birth Month','Birth Day');
  if(field==='hukou')additions.push('户籍省份','户籍城市','户籍区县');for(const a of additions)if(!aliases.includes(a))aliases.push(a);
  schema.push({key:canonical,storage:group+'.'+field,group,field,label,aliases:[...aliases],type:/salary/i.test(field)?'salary':/start|end|birthday|birthDate|graduationDate|^date$/.test(field)?'date':/useTime|duration|workYears/.test(field)?'duration':/level|proficiency/i.test(field)?'level':'text'});
 }
 const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 function canonical(key){const a=key.split('.');return (rename[a[0]]||a[0])+(a.length===3?'['+a[1]+'].':'.')+(fields[a.at(-1)]||a.at(-1));}
 function contextGroups(text){
  const groups=Object.entries(core.groups).filter(([,def])=>def.context.test(text||''));
  const exact=groups.filter(([,def])=>normalize(def.title)===normalize(text));
  if(exact.length===1)return exact.map(([group])=>group);
  // “工作/experience” is generic and must not override campus/project section meaning.
  const specific=groups.filter(([group])=>group!=='work');
  return (specific.length?specific:groups).map(([group])=>group);
 }
 globalThis.ResumeSchema={fields:schema,canonical,normalize,contextGroups};
})();
