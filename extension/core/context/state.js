let registry=new Map(),undoStack=[],scanId='',sectionMarkers=[],lastFields=[],activeAddTarget=null,virtualRecordCounts=new Map(),stateUrl=location.href;
const excluded=/^(password|hidden|file|submit|button|reset|image|range|color)$/;
const norm=v=>ResumeCore.normalize(v), choiceNorm=v=>ResumeCore.choiceNorm(v);
const SECTION_NAMES=['家庭关系','家庭成员','家庭情况','亲属信息','Personal Information','Education','Work Experience','Employment','Projects','Skills','Family','Languages','个人基本信息','个人信息','基本信息','教育经历','学历经历','工作经历','实习经历','任职经历','实习（工作）及社会经历','实习(工作)及社会经历','社会经历','实践经历','项目经验','项目经历','校园经历','校内经历','在校实践','学生工作','社团经历','奖项荣誉','获奖经历','荣誉奖励','获奖情况','求职意向','证书','资格证书','专业技能','计算机技能','电脑技能','软件技能','英语能力','其他外语能力','语言能力','自我评价'];
// Moka (app.mokahr.com) ships a CSS-in-JS stack where every class is "<block>-<hash>". The hash
// changes on every deploy, so these are matched on the stable block prefix only.
const FIELD_CONTAINER_SELECTOR='.ant-form-item,.el-form-item,.arco-form-item,.semi-form-field,.t-form__item,.ivu-form-item,.n-form-item,.layui-form-item,.van-field,.MuiFormControl-root,.form-item,.form-group,.field-item,.field-row,.resume-item,.control-group,[class*="apply-field-"],[class*="apply-block-"],tr,li';
// Same reasoning for the title element inside such a row.
const CONTAINER_LABEL_SELECTOR=':scope > label,:scope > .label,:scope > .form-label,:scope > .control-label,:scope > .ant-form-item-label,:scope > .ant-form-item-row > .ant-form-item-label,:scope > .ant-row > .ant-form-item-label,:scope > .el-form-item__label,:scope > .arco-form-label-item,:scope > .semi-form-field-label,:scope > .t-form__label,:scope > .ivu-form-item-label,:scope > .n-form-item-label,:scope > [class*="title-"],:scope > dt,:scope > th';
// Headings that word the same idea differently across ATS templates.
SECTION_NAMES.push('主要社会实践活动','在校活动','在校活动/社团情况','社团活动','在校活动/社团','校内职务','校内任职','学校职务','教育背景','教育信息','教育经历及学历','工作背景','工作及实习经历','实习及工作经历','获奖及荣誉','荣誉奖项','证书培训','培训经历');
const SECTION_NORMS=new Map(SECTION_NAMES.map(x=>[norm(x),x]));
// Section headings frequently bundle the section's own controls into the same element, so the visible
// text never equals the section name: Moka renders "教育背景" plus an "添加" button inside one blockTitle
// div, giving "教育背景添加". Cut at the first control word and retry the exact lookup.
const SECTION_CHROME=/(添加|新增|新建|编辑|删除|设置|更多|保存|取消|上传|必填项?|说明|提示|如有|建议|此处|收起|展开)/;
function cleanSectionText(text){
  return String(text||'')
    .replace(/\s+/g,' ')
    .replace(/[必填*＊]/g,'')
    // 招聘站常把每条经历标题写成“教育经历(1) / 实习经历（2） / 校内职务 3”。
    // 记录序号不是模块语义，必须先剥掉，否则“开始时间”会失去教育/工作上下文。
    .replace(/[（(]\s*\d+\s*[）)]/g,'')
    .replace(/(?:第\s*\d+\s*(?:条|段|项))/g,'')
    .replace(/[（(](?:请从|从最高)[^）)]*[）)]/g,'')
    .replace(/\s*[-—–]?\s*(?:删除|编辑|收起|展开)\s*$/g,'')
    .trim();
}
function sectionNameFor(text){
  const bare=cleanSectionText(text);
  if(!bare||bare.length>32)return '';
  const cut=cleanSectionText(bare.split(SECTION_CHROME)[0]);
  const exact=SECTION_NORMS.get(norm(bare))||SECTION_NORMS.get(norm(cut));
  if(exact)return exact;
  // 对真实 ATS 的“模块名 + 编号/提示/操作词”做保守前缀归一。这里只判断模块，不判断具体字段。
  const t=norm(cut||bare);
  if(/^教育(?:经历|背景|信息|学历)/.test(t)||/^学历(?:经历|信息)/.test(t))return '教育经历';
  if(/^实习(?:经历|经验)/.test(t))return '实习经历';
  if(/^工作(?:经历|经验|背景)/.test(t)||/^任职经历/.test(t))return '工作经历';
  if(/^校内(?:职务|任职|经历|实践)/.test(t)||/^校园(?:经历|实践)/.test(t)||/^学生工作/.test(t)||/^社团/.test(t))return '校内职务';
  if(/^项目(?:经历|经验)/.test(t)||/^课题/.test(t))return '项目经历';
  if(/^荣誉|^获奖|^奖项/.test(t))return '奖项荣誉';
  if(/^证书|^资格|^培训/.test(t))return '证书';
  if(/^语言|^外语|^英语能力/.test(t))return '语言能力';
  if(/^家庭|^亲属/.test(t))return '家庭关系';
  if(/^专业技能|^技能特长/.test(t))return '专业技能';
  if(/^计算机|^电脑|^软件技能/.test(t))return '计算机技能';
  if(/^求职意向/.test(t))return '求职意向';
  if(/^个人基本信息|^个人信息|^基本信息/.test(t))return '个人基本信息';
  return '';
}
