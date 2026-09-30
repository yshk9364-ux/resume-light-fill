/* Shared by the extension UI and content script. Local-only, no network requests. */
(function (root) {
  'use strict';

  const basics = [
    ['name','姓名',['姓名','中文姓名','真实姓名','应聘者姓名','候选人姓名','fullname','name']],
    ['englishName','英文名／拼音',['英文名','英文姓名','姓名拼音','拼音','englishname','pinyin']],
    ['phone','手机号码',['手机','手机号码','手机号','电话号码','联系电话','联系电话号码','移动电话','联系方式','mobile','phone','tel']],
    ['backupPhone','备用联系电话',['备用电话','备用联系电话','其他联系电话']],
    ['email','电子邮箱',['电子邮箱','邮箱','邮件地址','个人邮箱','email','emailaddress']],
    ['wechat','微信号',['微信','微信号','wechat']],
    ['gender','性别',['性别','gender','sex']],
    ['birthday','出生日期',['出生日期','出生年月','出生年月日','生日','birthday','birthdate','dateofbirth']],
    ['nationality','国籍／地区',['国籍','国家','国家/地区','国家地区','国籍/地区','国籍地区','nationality','country']],
    ['ethnicity','民族',['民族','ethnicity','nation']],
    ['political','政治面貌',['政治面貌','政治身份','政治情况','党派','党派身份','politicalstatus','politicalaffiliation','party']],
    ['partyJoinDate','政治面貌参加年月',['政治面貌参加年月','政治面貌参加时间','入党时间','入党日期','入党年月','加入中国共产党时间','党籍起始时间','partyjoin date','partymembershipdate']],
    ['idType','证件类型',['证件类型','证件种类','身份证件类型','idtype','documenttype']],
    ['idNumber','证件号码',['证件号码','证件号','身份证号','身份证号码','idnumber','documentnumber']],
    ['marital','婚姻状况',['婚姻状况','婚姻状态','maritalstatus']],
    ['onlyChild','是否独生子女',['是否独生子女','是否是独生子女','是否为独生子女','是否独生女','是否是独生女','是否为独生女','是否独生子','是否是独生子','是否为独生子','独生子女','独生女','独生子','独生','唯一子女','onlychild','only child']],
    ['height','身高',['身高','身高(厘米)','身高（厘米）','身高cm','height']],
    ['weight','体重',['体重','体重(公斤)','体重（公斤）','体重kg','weight']],
    ['healthStatus','健康状况',['健康状况','健康情况','身体健康','身体状况','healthstatus','health condition']],
    ['birthplace','籍贯',['籍贯','祖籍','出生地','出生地点','nativeplace']],
    ['hukou','户籍所在地',['户籍所在地','户口所在地','户籍地址','户口地址','户籍地','户口地']],
    ['admissionHukou','入学前户口所在地',['入学前户口所在地','入学前户籍所在地','入学前户口','入学前户籍','高考前户口所在地','入学前户籍地','生源地','生源所在地']],
    ['hukouType','户籍性质',['户籍性质','户口性质','农业户口','非农业户口']],
    ['city','现居住地',['现居城市','现居住地','现居住城市','当前城市','居住城市','所在城市','currentcity']],
    ['address','通讯地址',['联系地址','通讯地址','通信地址','详细地址','现居住址','address']],
    ['postcode','邮政编码',['邮政编码','邮编','postalcode','zipcode']],
    ['emergencyContactName','紧急联系人',['紧急联系人','紧急联络人','应急联系人','emergencycontact','emergency contact']],
    ['emergencyContactPhone','紧急联系电话',['紧急联系电话','紧急联系人电话','紧急联络电话','应急联系电话','emergencyphone','emergency contact phone']],
    ['graduationYear','毕业年份',['毕业年份','毕业年度','graduationyear']],
    ['graduationDate','毕业时间',['毕业时间','毕业日期','预计毕业时间','预计毕业日期','毕业年月','graduationdate']],
    ['currentStatus','当前身份',['当前身份','人员类别','应届往届','应届生身份','毕业生类型']],
    ['workYears','工作年限',['工作年限','全职工作年限','工作经验年限','工作经验','从业年限']],
    ['website','个人网站／作品集',['个人网站','个人主页','作品集链接','作品集','个人博客','portfolio','website']],
    ['position','意向职位',['意向职位','求职意向','应聘职位','申请职位','期望岗位','目标岗位','输入职位关键字','职位关键字','意向职位名称','desiredposition']],
    ['cityPreference','意向城市',['意向城市','期望城市','意向工作城市','意向工作地','意向工作地点','期望工作城市','期望工作地点','工作地点意向']],
    ['salary','期望月薪',['期望待遇','期望收入','期望月薪','月薪期望','期望月度薪酬','期望税前月薪','期望薪资/月','期望薪资（月）','期望薪资(月)','期望薪资','期望薪酬','薪资期望','expected monthly salary','monthly salary','expected salary','salary']],
    ['expectedAnnualSalary','期望年薪',['期望年薪','年薪期望','期望年度薪酬','年度期望薪酬','期望税前年薪','期望薪酬（年）','期望薪酬(年)','期望薪资（年）','期望薪资(年)','expected annual salary','desired annual salary','annual compensation']],
    ['currentSalary','目前薪酬',['目前薪酬','目前薪资','当前薪酬','当前薪资','现有薪酬','现有薪资','现薪','当前月薪','目前月薪','现工资','目前工资','当前年薪','目前年薪','current salary','current pay','present salary']],
    ['availableDate','最早到岗时间',['最早到岗','到岗时间','可到岗时间','预计到岗时间','最快到岗','可入职时间','预计入职时间','到职时间','availabledate','availability','start availability']],
    ['summary','自我评价',['自我评价','评价内容','个人简介','自我介绍','个人优势','自我描述','summary','aboutme']],
    ['hobbies','爱好特长',['爱好特长','兴趣爱好','兴趣特长','个人爱好','个人特长','业余爱好','爱好','特长爱好','个人特长和爱好','特长和爱好','兴趣','hobbies','interests']],
    ['traits','个人特点',['个人特点','个人标签','性格特点','个性标签','个人特质','性格特征','特点','traits','personality']],
    ['skills','专业技能',['专业技能','技能特长','个人技能','技能','skills']],
    ['linkedin','LinkedIn',['linkedin','linkedinurl']],
    ['github','GitHub',['github','githuburl']]
  ];

  const groups = {
    family:{title:'家庭关系',context:/家庭关系|家庭成员|家庭情况|亲属信息|亲属关系|配偶|父母|父亲|母亲|family|relative/i,fields:[
      ['relation','与本人关系',['与本人关系','本人关系','亲属关系','称谓','关系','relationship','relation']],
      ['name','亲属姓名',['亲属姓名','姓名','家庭成员姓名','家属姓名','name']],
      ['birthDate','出生日期',['出生日期','出生年月','生日','birthdate','dateofbirth']],
      ['age','年龄',['年龄','周岁','age']],
      ['company','工作单位',['工作单位','单位','单位名称','任职单位','company','employer']],
      ['department','工作部门',['工作部门','所在部门','部门','department']],
      ['title','职务',['职务','岗位','职位','职业','occupation','title']],
      ['phone','联系电话',['联系电话','手机号码','手机号','电话','移动电话','contactphone','phone']],
      ['political','政治面貌',['政治面貌','政治身份','党派','politicalstatus','politicalaffiliation']],
      ['chinaPostEmployee','是否为中国邮政系统职工',['是否为中国邮政系统职工','是否中国邮政系统职工','是否邮政系统职工','是否为邮政系统职工','中国邮政系统职工','邮政系统职工']]
    ]},
    education:{title:'教育经历',context:/教育|学历|院校|学校|education|academic/i,fields:[
      ['school','学校名称',['毕业院校','学校名称','学校','院校','school','university','institution']],
      ['college','学院／院系',['学院','院系','学院名称','院系名称','college','department']],
      ['major','专业',['所学专业','专业名称','最近毕业专业','毕业专业','专业','major','fieldofstudy']],
      ['degree','学历',['最高学历','学历','教育程度','全日制最高学历','最高学历层次','degree','qualification']],
      ['degreeName','学位',['学位','学位类型','最高学位','全日制最高学位','degree name']],
      ['firstDegree','是否第一学历',['第一学历','是否第一学历','是否为第一学历','first degree']],
      ['studyType','受教育类型／学习形式',['受教育类型','教育类型','培养方式','学习形式','教育形式','就读形式','全日制','最高学历学习形式','学历学习形式','studytype']],
      ['duration','学制',['学制','学制年限','培养年限','educationduration']],
      ['overseasStudy','海外学习经历',['是否有海外学习经历','是否海外学习','该段教育经历内是否有海外学习经历','海外学习经历','境外学习经历']],
      ['start','入学时间',['入学时间','入学日期','入校时间','就读开始时间','就读开始日期','学习开始时间','开始时间','开始日期','开始年月','startdate','from']],
      ['end','毕业时间',['毕业时间','毕业日期','预计毕业时间','离校时间','就读结束时间','就读结束日期','学习结束时间','结束时间','结束日期','结束年月','enddate','to']],
      ['gpa','GPA',['gpa','绩点','成绩(gpa)','gpa成绩','平均绩点','满绩点/总分','满绩点／总分','绩点/总分']],
      ['rank','专业排名',['专业排名','成绩排名','最高学历班级排名','班级排名','排名','rank']],
      ['courses','主修课程',['主修课程','核心课程','主要课程','courses']],
      ['description','专业描述／在校经历',['专业描述','在校经历','在校表现','教育经历描述','校园经历','description']],
      ['researchAchievement','研究方向及成就',['研究方向及成就','研究方向与成就','研究方向和成就','研究方向及成果','研究成果','学术方向及成就']]
    ]},
    work:{title:'工作／实习经历',context:/工作|实习|任职|就业|社会经历|实践经历|employment|work|experience/i,fields:[
      ['workType','工作类型',['工作类型','经历类型','任职类型','实习类型','用工类型','employmenttype','worktype']],
      ['company','公司名称',['公司名称','公司','企业名称','工作单位','单位名称','实习单位','任职单位','company','employer']],
      ['industry','所属行业',['所属行业','公司行业','行业类别','所在行业','公司所属行业','行业','industry']],
      ['companySize','企业规模',['企业规模','公司规模','单位规模','companysize']],
      ['department','部门',['部门','所在部门','部门名称','department']],
      ['title','职位名称',['职位名称','担任职务','职务','岗位名称','岗位','职位','实习岗位','jobtitle']],
      ['annualSalary','职位年薪',['职位年薪','年薪','岗位年薪','annualsalary']],
      ['monthlySalary','职位月薪（税前）',['职位月薪(税前)','职位月薪（税前）','职位月薪','税前月薪','岗位月薪','任职月薪','月薪(税前)','月薪（税前）','monthlysalary','monthly pay']],
      ['location','工作地点',['工作地点','任职地点','实习地点','location']],
      ['start','开始时间',['入职时间','入职日期','任职开始时间','实习开始时间','工作开始时间','开始时间','开始日期','开始年月','startdate','from']],
      ['end','结束时间',['离职时间','离职日期','任职结束时间','实习结束时间','工作结束时间','结束时间','结束日期','结束年月','enddate','to']],
      ['description','工作内容',['工作内容','工作描述','职责描述','工作职责','实习内容','主要职责','主要工作职责','主要工作职责和业绩','主要工作职责及业绩','工作职责和业绩','工作职责及业绩','岗位职责和业绩','岗位职责及业绩','主要业绩','description','responsibilities']],
      ['reason','离职原因',['离职原因','离职理由','结束原因','reason for leaving']]
    ]},
    projects:{title:'项目经验',context:/项目|课题|project/i,fields:[
      ['name','项目名称',['项目名称','课题名称','projectname']],
      ['role','项目角色',['项目角色','担任角色','角色','role']],
      ['responsibility','项目职责',['项目职责','本人职责','个人职责','职责分工','projectresponsibility']],
      ['start','开始时间',['开始时间','开始日期','startdate','from']],
      ['end','结束时间',['结束时间','结束日期','enddate','to']],
      ['description','项目描述',['项目描述','项目介绍','项目内容','项目成果','description']]
    ]},
    campus:{title:'校园／学生工作',context:/校园|学生|社团|干部|校内|在校实践|主要社会实践活动|student|campus|club/i,fields:[
      ['organization','组织名称',['组织名称','社团名称','社团/活动/部门名称','活动/社团/部门名称','社团或活动名称','学校组织','学生组织','实践单位','实践名称','organization']],
      ['department','部门',['部门','所在部门','实践部门','department']],
      ['title','职务',['职务','担任职务','职位','实践岗位','角色','title']],
      ['cadreLevel','干部级别',['干部级别','学生干部级别','干部等级','职务级别']],
      ['start','开始时间',['开始时间','任职开始','startdate','from']],
      ['end','结束时间',['结束时间','任职结束','enddate','to']],
      ['description','经历描述',['工作内容','经历描述','实践描述','主要成绩及收获','职责','职责和成就','职责与成就','工作职责及成就','主要工作','主要内容','主要工作内容','主要职责','工作职责','任职内容','活动内容','校园经历主要内容','学生工作主要内容','社团经历主要内容','description']]
    ]},
    awards:{title:'奖项／荣誉',context:/奖项|荣誉|获奖|奖励|award|honor/i,fields:[
      ['name','奖项名称',['奖项名称','获奖项','荣誉名称','获奖名称','奖励名称','主要获奖','award']],
      ['date','获奖时间',['获奖时间','获得时间','颁发时间','date']],
      ['issuer','颁发单位',['颁发单位','授奖单位','授予单位','发证单位','issuer']],
      ['level','奖项级别',['奖项级别','获奖级别','荣誉级别','级别','level']],
      ['description','奖项说明',['奖项说明','获奖说明','描述','description']]
    ]},
    certificates:{title:'证书',context:/证书|资格|资质|certificate|license/i,fields:[
      ['name','证书名称',['证书名称','资格证书','证书','certificate','license']],
      ['date','获得时间',['获取时间','获得时间','取得时间','证书时间','发证时间','date']],
      ['issuer','发证机构',['发证机构','颁发单位','颁发机构','发证单位','issuer']],
      ['number','证书编号',['证书编号','证书号码','资格证号','certificatenumber']]
    ]},
    professionalSkills:{title:'专业技能',context:/专业技能|技能特长|professionalskill/i,fields:[
      ['name','技能名称',['技能名称','专业技能','技能类别','名称','技能','skill']],
      ['level','掌握程度',['掌握程度','熟练程度','技能水平','等级','熟练度','level','proficiency']],
      ['description','技能描述',['技能描述','说明','description']]
    ]},
    computerSkills:{title:'计算机技能',context:/计算机技能|电脑技能|软件技能|computerskill/i,fields:[
      ['category','技能类别',['技能类别','技能名称','软件名称','计算机技能','software','skill']],
      ['useTime','使用时间',['使用时间','使用年限','使用时长','经验年限','years of use']],
      ['level','掌握程度',['掌握程度','熟练程度','技能水平','level','proficiency']],
      ['description','技能说明',['技能说明','技能描述','应用情况','使用说明','熟练说明','description']]
    ]},
    languages:{title:'语言能力',context:/语言|外语|英语|language/i,fields:[
      ['language','语言',['语言','语种','language']],
      ['level','水平',['水平','熟练程度','语言水平','掌握程度','level','proficiency']],
      ['certificateName','证书名称',['英语证书名称','外语证书名称','语言证书名称','证书名称','certificate name']],
      ['score','成绩',['成绩','分数','得分','考试成绩','考试得分','score']],
      ['certificate','证书／成绩说明',['证书','语言证书','certificate']]
    ]}
  };

  // Reusable defaults explicitly requested by the user. Consent/privacy/health/shift/travel questions stay manual.
  const defaults = [];

  const normalize=value=>String(value||'').toLowerCase().replace(/[\s_\-:：*＊()（）\/\.，,；;？?！!【】\[\]·]/g,'');
  const choiceNorm=value=>{
    const n=normalize(value);
    // 政治面貌必须先区分“正式党员/预备党员”，避免两个选项都被归并为“党员”造成歧义。
    if (/^(中共预备党员|中国共产党预备党员|预备党员)$/.test(n)) return 'ccp-probationary';
    if (/^(中共党员|中国共产党党员|共产党员|正式党员)$/.test(n)) return 'ccp-member';
    if (/^(共青团员|中国共产主义青年团团员|团员)$/.test(n)) return 'cyl-member';
    if (/^(群众|无党派群众)$/.test(n)) return 'masses';
    if (/^(无党派人士)$/.test(n)) return 'nonparty';
    if (/^(民革|民盟|民建|民进|农工党|致公党|九三学社|台盟|民主党派)$/.test(n)) return n;
    if (/^(身份证|居民身份证|中华人民共和国居民身份证|大陆身份证|idcard|identitycard)$/.test(n)) return 'idcard';
    if (/^(是|有|是的|yes|y|true|1|符合|同意|接受|愿意|可接受|可以|允许|服从|接受调剂|同意调剂)$/.test(n)) return 'yes';
    if (/^(否|无|没有|不是|no|n|false|0|不符合|不同意|不接受|拒绝|不愿意|不可接受|不服从|不接受调剂)$/.test(n)) return 'no';
    if (/^(0年|0|无经验|暂无经验|无工作经验|没有工作经验|应届|应届生|应届毕业生)$/.test(n)) return 'noexperience';
    if (/男|male/.test(n)) return 'male';
    if (/女|female/.test(n)) return 'female';
    if (/未婚|single|unmarried/.test(n)) return 'single';
    if (/已婚|married/.test(n)) return 'married';
    if (/^(中国|中国大陆|中华人民共和国|大陆|china|cn)$/.test(n)) return 'china';
    if (/^(本科|大学本科|学士本科)$/.test(n)) return '本科';
    if (/^(学士|学士学位|管理学学士|文学学士|理学学士|工学学士|经济学学士|法学学士|教育学学士|艺术学学士)$/.test(n)) return '学士';
    if (/^(随时|随时到岗|立即|立即到岗|可立即到岗|马上到岗|尽快|尽快到岗|可尽快到岗|近期到岗|一周内|1周内|一周内到岗|1周内到岗)$/.test(n)) return '尽快到岗';
    return n;
  };

  function blankRecord(def){return Object.fromEntries(def.fields.map(([key])=>[key,'']));}
  function emptyProfile(){
    const p={id:crypto.randomUUID(),title:'我的简历',basics:{}};
    for(const [key] of basics)p.basics[key]='';
    for(const [group,def] of Object.entries(groups))p[group]=group==='education'||group==='work'||group==='projects'?[blankRecord(def)]:[];
    return p;
  }
  function ageFromBirthDate(value){
    const m=String(value||'').match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);if(!m)return '';
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),now=new Date();let age=now.getFullYear()-y;
    if(now.getMonth()+1<mo||(now.getMonth()+1===mo&&now.getDate()<d))age--;
    return age>=0&&age<130?String(age):'';
  }
  function entries(profile){
    const out=basics.map(([key,label,aliases])=>({key:`basics.${key}`,label,aliases,group:'basics',value:String(profile.basics?.[key]||'')}));
    for(const [group,def] of Object.entries(groups)) (profile[group]||[]).forEach((record,index)=>{
      for(const [key,label,aliases] of def.fields){
        let value=record[key]||'';
        if(group==='family'&&key==='age'&&!String(value).trim()) value=ageFromBirthDate(record.birthDate);
        out.push({key:`${group}.${index}.${key}`,label:`${def.title} ${index+1} · ${label}`,aliases,group,index,value:String(value||'')});
      }
    });
    out.push(...defaults);
    return out;
  }
  function textSimilarity(a,b){
    a=normalize(a); b=normalize(b); if(!a||!b) return 0; if(a===b) return 1;
    if(a.includes(b)||b.includes(a)) return Math.min(a.length,b.length)/Math.max(a.length,b.length)*.9+.1;
    const sa=new Set(a), sb=new Set(b); let inter=0; for(const c of sa) if(sb.has(c)) inter++;
    return inter/Math.max(sa.size,sb.size);
  }
  function fieldText(field){return [field.context,...(field.semanticLabels?.length?field.semanticLabels:(field.labels||[]))].filter(Boolean).join(' ');}
  function isSensitiveOrManual(field){
    // The user explicitly supplied their own identity document data for local autofill. Keep family
    // contacts, bank details, medical detail and consent statements manual. A plain “健康状况” answer is
    // a form field the user filled in on purpose (they reported it as 健康), so only the clinical terms
    // are blocked here.
    return /推荐人|证明人|银行卡|薪资证明|疾病|残疾|病史|体检|宗教|工会|隐私协议|真实性声明|授权|同意条款|签名|referr|health|disability|consent|privacy/i.test(fieldText(field));
  }
  function directDefaultMatch(field,values){
    const full=normalize(fieldText(field));
    const hits=values.filter(x=>x.kind==='choice'&&String(x.value||'').trim()).filter(entry=>(entry.aliases||[]).some(a=>{
      const n=normalize(a); return n&&full.includes(n);
    }));
    return hits.length===1?hits[0].key:null;
  }
  function match(field,values){
    if(isSensitiveOrManual(field)) return null;
    const direct=directDefaultMatch(field,values); if(direct) return direct;

    // 扫描器已经能够确定字段语义时，优先使用精确资料键，避免“开始时间/证书/学历”等重复字段互相串线。
    if(field.basicKey){
      const exact=values.find(x=>x.key===`basics.${field.basicKey}`&&String(x.value||'').trim());
      // 已经确定字段语义后，不再回退到“相似字段”。资料为空就留空，避免错填。
      return exact?.key||null;
    }
    if(field.groupHint&&field.fieldKey){
      let targetIndex;
      if(Number.isInteger(field.recordIndex)) targetIndex=field.recordIndex;
      else {
        // 重复经历没有可靠记录序号时，绝不能默认塞到第 1 条。
        // 只有资料库该组本身仅有一条记录时，才安全地使用 index 0。
        const groupIndexes=[...new Set(values.filter(x=>x.group===field.groupHint&&Number.isInteger(x.index)).map(x=>x.index))];
        if(groupIndexes.length===1) targetIndex=groupIndexes[0];
        else return null;
      }
      if(field.groupHint==='languages'&&/英语/.test(field.context||'')){
        const english=values.find(x=>x.group==='languages'&&x.key.endsWith('.language')&&/英语|english/i.test(x.value||''));
        if(english) targetIndex=english.index;
      }
      const exact=values.find(x=>x.group===field.groupHint&&x.index===targetIndex&&x.key===`${field.groupHint}.${targetIndex}.${field.fieldKey}`&&String(x.value||'').trim());
      return exact?.key||null;
    }
    // 没有上下文的“开始/结束/时间/描述”等高歧义字段，宁可不自动填。
    if((field.labels||[]).some(x=>/^(开始时间|结束时间|开始日期|结束日期|时间|日期|描述|说明|名称|成绩|部门|职位)$/i.test(String(x||'').replace(/[＊*：:]/g,'').trim()))) return null;

    const labels=(field.labels||[]).map(normalize).filter(Boolean);
    const full=normalize(fieldText(field));
    const autocomplete={name:'name',email:'email',tel:'phone',bday:'birthday','street-address':'address','postal-code':'postcode','address-level2':'city'}[field.autocomplete];
    const candidates=values.filter(x=>String(x.value||'').trim()).map(entry=>{
      let score=0;
      for(const label of labels) for(const alias of entry.aliases||[]){
        const a=normalize(alias); if(!a) continue;
        if(label===a||label===`请输入${a}`||label===`请选择${a}`) score=Math.max(score,120);
        else if(label.includes(a)||a.includes(label)) score=Math.max(score,92);
        else { const sim=textSimilarity(label,a); if(sim>=.72) score=Math.max(score,70+Math.round(sim*20)); }
      }
      if(entry.kind==='choice'){
        const aliasHit=(entry.aliases||[]).some(a=>{const n=normalize(a);return n&&(full.includes(n)||textSimilarity(full,n)>.78);});
        if(aliasHit) score=Math.max(score,118);
      }
      if(autocomplete&&entry.key===`basics.${autocomplete}`) score=Math.max(score,130);
      if(entry.group&&entry.group!=='basics'&&field.context){
        const matchedGroups=Object.entries(groups).filter(([,def])=>def.context.test(field.context));
        if(matchedGroups.length===1&&matchedGroups[0][0]!==entry.group) score=Math.min(score,25);
        else if(groups[entry.group]?.context.test(field.context)&&score) score+=16;
        if(entry.group==='languages'&&/英语/.test(field.context)){
          const languageValue=values.find(v=>v.group==='languages'&&v.index===entry.index&&v.key.endsWith('.language'))?.value||'';
          if(/英语|english/i.test(languageValue)) score+=45; else score=Math.min(score,30);
        }
      }
      if(field.groupHint&&entry.group===field.groupHint&&Number.isInteger(field.recordIndex)&&Number.isInteger(entry.index)){
        if(entry.index===field.recordIndex) score+=42;
      }
      if(field.options?.length){
        const choice=choiceNorm(entry.value); const opts=field.options.map(o=>choiceNorm(o.text||o.value));
        if(opts.includes(choice)) score+=8;
      }
      return {...entry,score};
    }).filter(x=>x.score>=88).sort((a,b)=>b.score-a.score);
    if(!candidates.length) return null;
    if(candidates[1]&&candidates[1].score===candidates[0].score) return null;
    return candidates[0].key;
  }
  function validateProfile(input){
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('简历必须是 JSON 对象');
    const profile={...JSON.parse(JSON.stringify(input)),...emptyProfile()}; profile.id=typeof input.id==='string'?input.id:profile.id;
    profile.title=typeof input.title==='string'?input.title.slice(0,100):'导入的简历';
    const copy=(obj,fields)=>Object.fromEntries(fields.map(([key])=>{const value=obj?.[key]??'';if(typeof value!=='string'||value.length>20000) throw new Error('字段必须为文本，且不能超过 20000 字');return [key,value];}));
    profile.basics={...input.basics,...copy(input.basics,basics)};
    for(const [group,def] of Object.entries(groups)){
      if(input[group]!==undefined&&(!Array.isArray(input[group])||input[group].length>30)) throw new Error('每类经历必须为数组，最多 30 条');
      profile[group]=(input[group]||[]).map(row=>({...row,...copy(row,def.fields)}));
    }
    return profile;
  }
  function mergeMissing(profile,defaultsProfile){
    const p=validateProfile(profile), d=validateProfile(defaultsProfile);
    for(const [key] of basics) if(!String(p.basics[key]||'').trim()&&String(d.basics[key]||'').trim()) p.basics[key]=d.basics[key];
    for(const [group,def] of Object.entries(groups)){
      if(!p[group].length&&d[group].length){p[group]=d[group].map(r=>({...r}));continue;}
      d[group].forEach((dr,i)=>{
        if(!p[group][i]){p[group][i]={...dr};return;}
        for(const [key] of def.fields) if(!String(p[group][i][key]||'').trim()&&String(dr[key]||'').trim()) p[group][i][key]=dr[key];
      });
    }
    p.id=profile.id||p.id; p.title=profile.title||p.title; return p;
  }
  root.ResumeCore={basics,groups,defaults,entries,match,normalize,choiceNorm,emptyProfile,validateProfile,mergeMissing,isSensitiveOrManual};
})(globalThis);
