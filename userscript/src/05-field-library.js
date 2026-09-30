// 标准求职字段库（§5/§6 的 fieldId 体系 + §7–§19 的完整字段覆盖 + 丰富别名）。
//
// 这是整个系统的地基：资料存储、AI 字段识别、映射学习、开放题切资料，全都以这里的 fieldId 为准。
// 引擎自带的 115 个字段（core/profile/schema.js）是"自动填的匹配集"，本库是"完整的标准模型"。
// 两者用同一套 fieldId 命名，所以互相兼容：本库里新增的字段，只在被问到别名时才参与匹配。
//
// 每个字段定义展开成 §6 的结构：fieldId/name/category/aliases/commonQuestions/dataType/options/
// formatRules/validationRules/aiEditable。value/locked/confidence/source/status 是"实例"属性，
// 存在 profile 里，不在库里（同一个字段在不同人/不同简历里的值和锁定状态都不一样）。
(function (root) {
  'use strict';

  // 紧凑声明格式：[fieldId, 显示名, category, dataType, 别名数组, 可选项?]
  // dataType 决定格式转换与控件适配：text / date / month / year / number / select / bool / email / phone / idcard / url / textarea
  const D = [
    // ---------------- 基础身份 personal（§7）
    ['personal.name', '姓名', 'personal', 'text', ['姓名', '中文姓名', '真实姓名', '应聘者姓名', '候选人姓名', '申请人姓名', '本人姓名', 'fullname', 'name']],
    ['personal.formerName', '曾用名', 'personal', 'text', ['曾用名', '原名', '曾用姓名', '过去的名字', 'former name', 'alias']],
    ['personal.englishName', '英文名', 'personal', 'text', ['英文名', '英文姓名', '外语姓名', 'english name', 'englishname']],
    ['personal.pinyinName', '姓名拼音', 'personal', 'text', ['姓名拼音', '拼音', '名字拼音', '汉语拼音', 'pinyin']],
    ['personal.gender', '性别', 'personal', 'select', ['性别', '男/女', '性别选择'], ['男', '女']],
    ['personal.birthDate', '出生日期', 'personal', 'date', ['出生日期', '出生年月日', '生日', '出生时间', '出生年月', 'birthday', 'date of birth', 'dob']],
    ['personal.birthYear', '出生年份', 'personal', 'year', ['出生年份', '出生年', '出生当年', 'birth year']],
    ['personal.age', '年龄', 'personal', 'number', ['年龄', '岁数', '周岁', 'age']],
    ['personal.nationality', '国籍', 'personal', 'text', ['国籍', '国家/地区', '所属国籍', 'nationality']],
    ['personal.ethnicity', '民族', 'personal', 'select', ['民族', '民族成分'], ['汉族', '满族', '回族', '蒙古族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族', '满族', '其他']],
    ['personal.politicalStatus', '政治面貌', 'personal', 'select', ['政治面貌', '政治背景', '党员情况'], ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众', '其他']],
    ['personal.partyJoinDate', '入党时间', 'personal', 'date', ['入党时间', '入党日期', '政治面貌参加年月', '党员起始时间', '党籍起始']],
    ['personal.leagueJoinDate', '入团时间', 'personal', 'date', ['入团时间', '入团日期', '加入共青团时间', '团员起始']],
    ['personal.maritalStatus', '婚姻状况', 'personal', 'select', ['婚姻状况', '婚姻状态', '婚否'], ['未婚', '已婚', '离异', '丧偶', '其他']],
    ['personal.onlyChild', '是否独生子女', 'personal', 'bool', ['是否独生子女', '独生子女', '独生子女吗']],
    ['personal.idType', '身份证件类型', 'personal', 'select', ['身份证件类型', '证件类型', '身份证类型', '身份证件'], ['居民身份证', '护照', '港澳通行证', '台湾通行证', '军官证', '其他']],
    ['personal.idNumber', '身份证号', 'personal', 'idcard', ['身份证号', '身份证号码', '证件号码', '身份证', '公民身份号码', 'id number', 'idcard']],
    ['personal.idValidDate', '身份证有效期', 'personal', 'date', ['身份证有效期', '证件有效期', '身份证有效期限', '证件有效至']],
    ['personal.passportNumber', '护照号', 'personal', 'text', ['护照号', '护照号码', 'passport number']],
    ['personal.passportValidDate', '护照有效期', 'personal', 'date', ['护照有效期', '护照有效至']],
    ['personal.nativePlace', '籍贯', 'personal', 'text', ['籍贯', '祖籍', '籍贯所在地', 'native place']],
    ['personal.sourcePlace', '生源地', 'personal', 'text', ['生源地', '生源所在地', '来源地', 'source place']],
    ['personal.householdPlace', '户籍所在地', 'personal', 'text', ['户籍所在地', '户口所在地', '户籍地', '户口所在地', 'household']],
    ['personal.householdType', '户口性质', 'personal', 'select', ['户口性质', '户籍类型', '户口类型'], ['农业户口', '非农业户口', '农村', '城市', '其他']],
    ['personal.resideCountry', '现居住国家', 'personal', 'text', ['现居住国家', '居住国家', '现居国家']],
    ['personal.resideProvince', '现居住省份', 'personal', 'text', ['现居住省份', '居住省份', '现居住省', '所在省份']],
    ['personal.resideCity', '现居住城市', 'personal', 'text', ['现居住城市', '居住城市', '现居城市', '所在城市', '当前城市']],
    ['personal.resideDistrict', '现居住区县', 'personal', 'text', ['现居住区县', '居住区县', '所在区县', '区/县']],
    ['personal.address', '通讯地址', 'personal', 'textarea', ['通讯地址', '通信地址', '详细地址', '住址', '家庭住址', '现住址']],
    ['personal.postcode', '邮政编码', 'personal', 'text', ['邮政编码', '邮编', '邮码', 'postcode', 'zip']],
    ['personal.height', '身高', 'personal', 'number', ['身高', '身高(cm)', '身高（厘米）', '身高cm', 'height']],
    ['personal.weight', '体重', 'personal', 'number', ['体重', '体重(kg)', '体重（公斤）', '体重kg', 'weight']],
    ['personal.healthStatus', '健康状况', 'personal', 'select', ['健康状况', '身体健康状况', '健康情况'], ['健康', '良好', '一般', '较差']],

    // ---------------- 联系方式 contact（§8）
    ['contact.phone', '手机号', 'contact', 'phone', ['手机号码', '手机号', '手机', '联系电话', '移动电话', '联系方式', '本人电话', 'mobile', 'phone', 'tel']],
    ['contact.phone2', '第二手机号', 'contact', 'phone', ['第二手机号', '备用手机', '备用电话', '第二联系电话']],
    ['contact.telephone', '固定电话', 'contact', 'text', ['固定电话', '座机', '家庭电话', '住宅电话', 'landline']],
    ['contact.email', '邮箱', 'contact', 'email', ['邮箱', '电子邮箱', '邮件地址', 'email', 'e-mail']],
    ['contact.email2', '第二邮箱', 'contact', 'email', ['第二邮箱', '备用邮箱']],
    ['contact.wechat', '微信', 'contact', 'text', ['微信', '微信号', 'wechat', 'wx']],
    ['contact.qq', 'QQ', 'contact', 'text', ['QQ', 'QQ号', '腾讯QQ']],
    ['contact.linkedin', 'LinkedIn', 'contact', 'url', ['LinkedIn', '领英', 'linkedin']],
    ['contact.github', 'GitHub', 'contact', 'url', ['GitHub', 'github', '代码主页']],
    ['contact.website', '个人网站', 'contact', 'url', ['个人网站', '个人主页', '博客', 'website', 'homepage']],
    ['contact.portfolio', '作品集链接', 'contact', 'url', ['作品集', '作品集链接', 'portfolio', '作品地址']],
    ['contact.emergencyName', '紧急联系人', 'contact', 'text', ['紧急联系人', '紧急联系人姓名']],
    ['contact.emergencyRelation', '紧急联系人关系', 'contact', 'select', ['紧急联系人关系', '与紧急联系人关系', '联系人关系'], ['父亲', '母亲', '配偶', '兄弟', '姐妹', '子女', '朋友', '其他']],
    ['contact.emergencyPhone', '紧急联系人电话', 'contact', 'phone', ['紧急联系人电话', '紧急联系电话', '联系人电话']],

    // ---------------- 教育经历 education（§9，支持多条）
    ['education.school', '学校', 'education', 'text', ['学校', '学校名称', '毕业院校', '院校', '就读学校', '毕业学校', 'school', 'university']],
    ['education.schoolEn', '学校英文名', 'education', 'text', ['学校英文名', '院校英文名', '英文学校']],
    ['education.college', '学院', 'education', 'text', ['学院', '二级学院', '所在学院']],
    ['education.major', '专业', 'education', 'text', ['专业', '专业名称', '所学专业', '就读专业', 'major']],
    ['education.majorEn', '专业英文名', 'education', 'text', ['专业英文名', '英文专业']],
    ['education.major2', '第二专业', 'education', 'text', ['第二专业', '辅修专业', '双学位专业']],
    ['education.degree', '学历', 'education', 'select', ['学历', '最高学历', '最高教育程度', '文化程度', '学历层次', 'education', 'degree'], ['大专', '本科', '硕士', '博士', '中专', '高中', '博士后', '其他']],
    ['education.degreeEn', '学位', 'education', 'select', ['学位', '最高学位', '学位名称'], ['学士', '硕士', '博士', '无', '其他']],
    ['education.firstDegree', '是否第一学历', 'education', 'bool', ['第一学历', '是否第一学历', '是否为第一学历']],
    ['education.length', '学制', 'education', 'number', ['学制', '学制年限', '在校年限']],
    ['education.educationType', '教育类型', 'education', 'select', ['教育类型', '教育性质'], ['全日制', '非全日制', '在职', '函授', '自考', '网络', '交换', '培训', '其他']],
    ['education.fullTime', '是否全日制', 'education', 'bool', ['是否全日制', '全日制', '是否统招']],
    ['education.trainingMode', '培养方式', 'education', 'select', ['培养方式', '学习形式'], ['普通全日制', '普通非全日制', '定向培养', '在职', '其他']],
    ['education.startDate', '入学时间', 'education', 'date', ['入学时间', '入学日期', '开始时间', '就读时间', 'start date', '入学年月']],
    ['education.endDate', '毕业时间', 'education', 'date', ['毕业时间', '毕业日期', '毕业年月', '结束时间', '学业结束日期', '预计毕业日期', '预计毕业时间', '最高学历毕业时间', '离校时间', 'end date', 'graduate date', '入学时间与毕业时间']],
    ['education.expectedGraduation', '预计毕业时间', 'education', 'date', ['预计毕业时间', '预计毕业日期', '预计毕业年月']],
    ['education.graduated', '是否毕业', 'education', 'bool', ['是否毕业', '已毕业', '毕业状态']],
    ['education.hasDiploma', '是否取得毕业证', 'education', 'bool', ['是否取得毕业证', '毕业证', '是否已拿到毕业证']],
    ['education.hasDegreeCert', '是否取得学位证', 'education', 'bool', ['是否取得学位证', '学位证', '是否已拿到学位证']],
    ['education.gpa', 'GPA', 'education', 'text', ['GPA', '绩点', '平均绩点', 'gpa']],
    ['education.gpaFull', 'GPA满分', 'education', 'text', ['GPA满分', '绩点满分', '绩点标准']],
    ['education.averageScore', '平均分', 'education', 'text', ['平均分', '平均成绩', '加权平均分']],
    ['education.rank', '成绩排名', 'education', 'text', ['成绩排名', '排名', '专业排名', '学业排名', '综合排名']],
    ['education.classRank', '班级排名', 'education', 'text', ['班级排名', '班内排名']],
    ['education.rankTotal', '排名总人数', 'education', 'number', ['排名总人数', '专业人数', '总人数']],
    ['education.courses', '主修课程', 'education', 'textarea', ['主修课程', '课程', '主要课程', '核心课程']],
    ['education.majorDesc', '专业描述', 'education', 'textarea', ['专业描述', '专业介绍', '学科描述']],
    ['education.researchDirection', '研究方向', 'education', 'text', ['研究方向', '研究领域']],
    ['education.researchAchievement', '研究方向及成就', 'education', 'textarea', ['研究方向及成就', '研究方向与成就', '研究方向和成就', '研究方向及成果', '研究成果']],
    ['education.thesisName', '论文名称', 'education', 'text', ['论文名称', '论文题目', '毕业论文题目']],
    ['education.supervisor', '导师', 'education', 'text', ['导师', '指导老师', '导师姓名']],
    ['education.schoolLocation', '学校所在地', 'education', 'text', ['学校所在地', '学校地址', '学校城市']],
    ['education.overseasExperience', '海外经历', 'education', 'textarea', ['海外经历', '海外学习']],
    ['education.exchangeExperience', '交换经历', 'education', 'textarea', ['交换经历', '交换项目', '交流经历']],
    ['education.freshGraduate', '是否应届毕业生', 'education', 'bool', ['是否应届毕业生', '应届毕业生', '应届生']],

    // ---------------- 工作/实习 employment（§10，支持多条）
    ['employment.company', '公司名称', 'employment', 'text', ['公司名称', '公司', '单位名称', '单位', '工作单位', '雇主', 'company', 'employer']],
    ['employment.companyEn', '公司英文名', 'employment', 'text', ['公司英文名', '英文公司名']],
    ['employment.industry', '公司行业', 'employment', 'text', ['公司行业', '所属行业', '行业', 'industry']],
    ['employment.companyNature', '公司性质', 'employment', 'select', ['公司性质', '企业性质', '单位性质'], ['国有', '民营', '外资', '合资', '上市公司', '事业单位', '政府机关', '其他']],
    ['employment.companyScale', '公司规模', 'employment', 'select', ['公司规模', '企业规模', '人员规模'], ['20人以下', '20-99人', '100-499人', '500-999人', '1000-9999人', '10000人以上']],
    ['employment.department', '部门', 'employment', 'text', ['部门', '所在部门', '部门名称']],
    ['employment.position', '职位', 'employment', 'text', ['职位', '职位名称', '岗位', '担任职位', '职务', 'position', 'job title']],
    ['employment.positionCategory', '职位类别', 'employment', 'text', ['职位类别', '岗位类别', '职能类别']],
    ['employment.positionLevel', '职级', 'employment', 'text', ['职级', '级别', '岗位级别']],
    ['employment.workType', '工作类型', 'employment', 'select', ['工作类型', '岗位类型', '工作性质', 'employment type'], ['全职', '兼职', '实习', '临时', '志愿者']],
    ['employment.startDate', '入职时间', 'employment', 'date', ['入职时间', '入职日期', '开始时间', '起始时间', '在职起始', 'start date']],
    ['employment.endDate', '离职时间', 'employment', 'date', ['离职时间', '离职日期', '结束时间', '终止时间', '在职结束', 'end date']],
    ['employment.onJob', '是否在职', 'employment', 'bool', ['是否在职', '在职状态', '目前是否在职']],
    ['employment.location', '工作地点', 'employment', 'text', ['工作地点', '工作地址', '办公地点', '工作城市', '工作所在地', 'work location']],
    ['employment.reportTo', '汇报对象', 'employment', 'text', ['汇报对象', '直属上级', '上级姓名']],
    ['employment.teamSize', '团队规模', 'employment', 'number', ['团队规模', '团队人数', '带团队人数']],
    ['employment.description', '工作内容', 'employment', 'textarea', ['工作内容', '工作描述', '岗位职责', '工作职责', '职责描述', '主要工作', 'job description', 'responsibilities']],
    ['employment.coreDuty', '核心职责', 'employment', 'textarea', ['核心职责', '主要职责', '关键职责']],
    ['employment.achievement', '工作成果', 'employment', 'textarea', ['工作成果', '业绩', '主要业绩', '工作成绩', '产出']],
    ['employment.kpi', 'KPI', 'employment', 'text', ['KPI', '绩效考核指标', '业绩指标']],
    ['employment.projectResult', '项目成果', 'employment', 'textarea', ['项目成果', '项目业绩']],
    ['employment.tools', '使用工具', 'employment', 'text', ['使用工具', '工具', '软件', '应用工具']],
    ['employment.salary', '当前薪资', 'employment', 'text', ['当前薪资', '目前薪资', '现有薪资']],
    ['employment.salaryBeforeTax', '税前薪资', 'employment', 'text', ['税前薪资', '税前月薪', '税前年薪']],
    ['employment.salaryStructure', '薪资结构', 'employment', 'text', ['薪资结构', '薪酬构成', '工资构成']],
    ['employment.leaveReason', '离职原因', 'employment', 'textarea', ['离职原因', '离职理由', '离职原因说明']],
    ['employment.hasLeavingCert', '是否有离职证明', 'employment', 'bool', ['是否有离职证明', '离职证明']],
    ['employment.nonCompete', '是否存在竞业协议', 'employment', 'bool', ['是否存在竞业协议', '竞业协议', '竞业限制']],
    ['employment.hasLaborContract', '是否签订劳动合同', 'employment', 'bool', ['是否签订劳动合同', '劳动合同']],

    // ---------------- 校园经历 campus（§11，支持多条）
    ['campus.organization', '组织名称', 'campus', 'text', ['组织名称', '社团名称', '学生组织', '俱乐部', '部门名称', '任职组织', 'organization']],
    ['campus.department', '部门', 'campus', 'text', ['部门', '所在部门', '社团部门']],
    ['campus.title', '职务', 'campus', 'text', ['职务', '担任职务', '学生干部职务', '职位']],
    ['campus.cadreLevel', '干部级别', 'campus', 'text', ['干部级别', '学生干部级别', '干部等级', '职务级别']],
    ['campus.isCadre', '是否学生干部', 'campus', 'bool', ['是否学生干部', '学生干部']],
    ['campus.startDate', '开始时间', 'campus', 'date', ['开始时间', '开始日期', '起始时间', 'start date']],
    ['campus.endDate', '结束时间', 'campus', 'date', ['结束时间', '结束日期', '终止时间', 'end date']],
    ['campus.activityName', '活动名称', 'campus', 'text', ['活动名称', '活动']],
    ['campus.activityRole', '活动角色', 'campus', 'text', ['活动角色', '担任角色']],
    ['campus.description', '工作内容', 'campus', 'textarea', ['工作内容', '工作描述', '负责事项', '主要工作', '做了什么', '职责和成就', '职责与成就', '工作职责及成就']],
    ['campus.achievement', '主要成果', 'campus', 'textarea', ['主要成果', '成果', '活动成果']],
    ['campus.manageCount', '管理人数', 'campus', 'number', ['管理人数', '管理团队人数', '带领人数']],
    ['campus.duty', '负责事项', 'campus', 'textarea', ['负责事项', '职责', '负责内容']],
    ['campus.honor', '获得荣誉', 'campus', 'text', ['获得荣誉', '荣誉', '所获荣誉']],

    // ---------------- 项目经历 projects（§12，支持多条）
    ['projects.name', '项目名称', 'projects', 'text', ['项目名称', '项目', '项目名', 'project name', 'name']],
    ['projects.category', '项目类别', 'projects', 'text', ['项目类别', '项目类型', '项目分类']],
    ['projects.startDate', '开始时间', 'projects', 'date', ['开始时间', '起始时间', '项目开始', 'start date']],
    ['projects.endDate', '结束时间', 'projects', 'date', ['结束时间', '终止时间', '项目结束', 'end date']],
    ['projects.role', '项目角色', 'projects', 'text', ['项目角色', '担任角色', '角色', '职责']],
    ['projects.background', '项目背景', 'projects', 'textarea', ['项目背景', '背景', '项目缘起']],
    ['projects.goal', '项目目标', 'projects', 'textarea', ['项目目标', '目标']],
    ['projects.intro', '项目介绍', 'projects', 'textarea', ['项目介绍', '项目描述', '项目内容', '项目简介']],
    ['projects.duty', '个人职责', 'projects', 'textarea', ['个人职责', '我的职责', '个人工作', '负责内容']],
    ['projects.tools', '使用工具', 'projects', 'text', ['使用工具', '工具', '开发工具']],
    ['projects.techStack', '技术栈', 'projects', 'text', ['技术栈', '技术', '使用技术']],
    ['projects.achievement', '项目成果', 'projects', 'textarea', ['项目成果', '成果', '产出']],
    ['projects.metric', '数据指标', 'projects', 'text', ['数据指标', '指标', '量化结果', '数据结果']],
    ['projects.link', '项目链接', 'projects', 'url', ['项目链接', '项目地址']],
    ['projects.github', 'GitHub链接', 'projects', 'url', ['GitHub链接', 'github', '代码链接']],
    ['projects.workLink', '作品链接', 'projects', 'url', ['作品链接', '作品地址', '演示链接']],
    ['projects.isPublic', '是否公开', 'projects', 'bool', ['是否公开', '是否公开项目']],
    ['projects.teamSize', '团队人数', 'projects', 'number', ['团队人数', '项目人数', '成员人数']],

    // ---------------- 获奖荣誉 awards（§13，支持多条）
    ['awards.name', '奖项名称', 'awards', 'text', ['奖项名称', '奖项', '荣誉名称', '获奖名称', '奖项全称', 'name']],
    ['awards.date', '获奖时间', 'awards', 'date', ['获奖时间', '获奖日期', '获得时间', '颁发时间', 'date']],
    ['awards.level', '奖项级别', 'awards', 'select', ['奖项级别', '级别', '获奖等级', '奖项等级'], ['国家级', '省级', '市级', '区级', '校级', '院级', '系级', '班级', '公司级', '其他']],
    ['awards.competition', '比赛名称', 'awards', 'text', ['比赛名称', '比赛', '竞赛名称', '赛事']],
    ['awards.rank', '比赛排名', 'awards', 'text', ['比赛排名', '名次', '获奖名次']],
    ['awards.grade', '获奖等级', 'awards', 'select', ['获奖等级', '等级', '奖项等次'], ['特等奖', '一等奖', '二等奖', '三等奖', '优秀奖', ' honorable', '入围奖', '参与奖']],
    ['awards.issuer', '颁发单位', 'awards', 'text', ['颁发单位', '授予单位', '颁奖单位', '主办单位']],
    ['awards.description', '奖项说明', 'awards', 'textarea', ['奖项说明', '获奖说明', '说明']],

    // ---------------- 证书 certificates（§14，支持多条）
    ['certificates.name', '证书名称', 'certificates', 'text', ['证书名称', '证书', '资格证书', 'name']],
    ['certificates.number', '证书编号', 'certificates', 'text', ['证书编号', '编号', '证书号']],
    ['certificates.date', '获取日期', 'certificates', 'date', ['获取日期', '取得日期', '获得时间', '发证日期', 'date']],
    ['certificates.expireDate', '到期日期', 'certificates', 'date', ['到期日期', '有效期至', '失效日期']],
    ['certificates.issuer', '颁发机构', 'certificates', 'text', ['颁发机构', '发证机构', '认证机构']],
    ['certificates.level', '证书等级', 'certificates', 'text', ['证书等级', '等级']],
    ['certificates.permanent', '是否永久有效', 'certificates', 'bool', ['是否永久有效', '永久有效']],

    // ---------------- 语言能力 languages（§15，支持多条）
    ['languages.language', '语言名称', 'languages', 'text', ['语言名称', '语言', '语种', 'language']],
    ['languages.score', '语言成绩', 'languages', 'text', ['语言成绩', '成绩', '分数', '得分', '考试成绩', '考试得分', 'score']],
    ['languages.level', '语言等级', 'languages', 'text', ['语言等级', '等级', '熟练度', '水平', 'level', 'proficiency']],
    ['languages.listening', '听力', 'languages', 'text', ['听力', '听力水平']],
    ['languages.speaking', '口语', 'languages', 'text', ['口语', '口语水平']],
    ['languages.reading', '阅读', 'languages', 'text', ['阅读', '阅读能力', '阅读水平']],
    ['languages.writing', '写作', 'languages', 'text', ['写作', '写作能力']],
    ['languages.years', '使用年限', 'languages', 'number', ['使用年限', '使用年数', '学了几年']],

    // ---------------- 求职意向 job（§17）
    ['job.currentCompany', '当前申请公司', 'job', 'text', ['当前申请公司', '申请公司', '投递公司', '目标公司']],
    ['job.currentPosition', '当前申请岗位', 'job', 'text', ['当前申请岗位', '申请岗位', '投递岗位', '应聘岗位']],
    ['job.positionCategory', '岗位类别', 'job', 'text', ['岗位类别', '职位类别']],
    ['job.firstChoice', '第一志愿岗位', 'job', 'text', ['第一志愿岗位', '第一志愿', '意向岗位']],
    ['job.secondChoice', '第二志愿岗位', 'job', 'text', ['第二志愿岗位', '第二志愿']],
    ['job.thirdChoice', '第三志愿岗位', 'job', 'text', ['第三志愿岗位', '第三志愿']],
    ['job.targetIndustry', '目标行业', 'job', 'text', ['目标行业', '期望行业', '意向行业']],
    ['job.targetCity', '期望城市', 'job', 'text', ['意向工作城市', '期望工作城市', '期望城市', '意向城市', '目标城市', '工作地点意向', '期望工作地点', '城市']],
    ['job.firstLocation', '第一工作地点', 'job', 'text', ['第一工作地点', '第一志愿地点', '意向地点一']],
    ['job.secondLocation', '第二工作地点', 'job', 'text', ['第二工作地点', '第二志愿地点', '意向地点二']],
    ['job.acceptAdjustment', '是否接受调剂', 'job', 'bool', ['是否接受岗位调剂', '是否接受调剂', '接受调剂', '岗位调剂', '是否接受调岗']],
    ['job.acceptRemote', '是否接受异地', 'job', 'bool', ['是否接受异地', '是否接受跨省市', '接受异地', '是否接受跨地区']],
    ['job.acceptNational', '是否接受全国调动', 'job', 'bool', ['是否接受全国调动', '是否接受全国范围', '全国调动', '是否服从全国分配']],
    ['job.acceptTravel', '是否接受出差', 'job', 'bool', ['是否接受出差', '能否接受出差', '接受出差']],
    ['job.acceptShift', '是否接受轮班', 'job', 'bool', ['是否接受轮班', '能否轮班', '接受轮班']],
    ['job.acceptOverseas', '是否接受驻外', 'job', 'bool', ['是否接受驻外', '是否接受海外', '接受驻外', '是否接受国外']],
    ['job.acceptInternship', '是否接受实习', 'job', 'bool', ['是否接受实习', '能否实习', '接受实习']],
    ['job.internshipDays', '每周实习天数', 'job', 'number', ['每周实习天数', '每周可实习天数', '实习天数']],
    ['job.internshipDuration', '实习时长', 'job', 'text', ['实习时长', '实习时长要求']],
    ['job.earliestArrival', '最早到岗时间', 'job', 'text', ['最早到岗时间', '最快到岗时间', '可到岗时间']],
    ['job.expectArrivalDate', '预计到岗日期', 'job', 'date', ['预计到岗日期', '预计到岗时间', '到岗日期']],
    ['job.expectSalary', '期望薪资', 'job', 'text', ['期望薪资', '期望工资', '薪资期望', '期望月薪']],
    ['job.minSalary', '最低薪资', 'job', 'text', ['最低薪资', '薪资下限', '最低期望']],
    ['job.salaryType', '薪资类型', 'job', 'select', ['薪资类型', '期望薪资类型', '薪资周期'], ['月薪', '年薪', '日薪', '时薪', '面议']],
    ['job.currentSalary', '当前薪资', 'job', 'text', ['当前薪资', '目前薪资']],
    ['job.jobType', '求职类型', 'job', 'select', ['求职类型', '招聘类型', '岗位性质', '校招社招', '类型'], ['校园招聘', '社会招聘', '实习', '管培生', '校园实习', '应届生']],

    // ---------------- 家庭信息 family（§18，支持多条）
    ['family.name', '家庭成员姓名', 'family', 'text', ['家庭成员姓名', '成员姓名', '姓名', '家人姓名', 'name']],
    ['family.relation', '与本人关系', 'family', 'text', ['与本人关系', '关系', '亲属关系', '家庭关系', 'relation']],
    ['family.gender', '性别', 'family', 'select', ['性别', '成员性别'], ['男', '女']],
    ['family.birthYear', '出生年份', 'family', 'year', ['出生年份', '成员出生年份', '出生年']],
    ['family.company', '工作单位', 'family', 'text', ['工作单位', '单位', '所在单位', '工作单位名称']],
    ['family.companyNature', '单位性质', 'family', 'text', ['单位性质', '性质']],
    ['family.position', '职务', 'family', 'text', ['职务', '成员职务', '职位']],
    ['family.phone', '联系电话', 'family', 'phone', ['联系电话', '家庭成员电话', '成员电话', '电话']],
    ['family.province', '所在省', 'family', 'text', ['所在省', '省份']],
    ['family.city', '所在城市', 'family', 'text', ['所在城市', '城市']],
    ['family.inCompany', '是否在本公司工作', 'family', 'bool', ['是否在本公司工作', '是否在本公司任职', '是否本公司员工']],
    ['family.isRelated', '是否为关联人员', 'family', 'bool', ['是否为本公司关联人员', '是否为公司关联人员', '是否存在关联关系']],

    // ---------------- 其他常见 misc（§19）
    ['misc.hasDriverLicense', '是否有驾照', 'misc', 'bool', ['是否有驾照', '有无驾照', '驾照']],
    ['misc.driverLicenseType', '驾照类型', 'misc', 'select', ['驾照类型', '准驾车型'], ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', '无']],
    ['misc.hasCar', '是否有车', 'misc', 'bool', ['是否有车', '有无汽车', '购车']],
    ['misc.militaryService', '是否服兵役', 'misc', 'select', ['是否服兵役', '服兵役情况', '兵役情况'], ['已服', '未服', '服兵役中', '预备役', '免役', '不适用']],
    ['misc.militaryStart', '服役时间', 'misc', 'text', ['服役时间', '服役起止']],
    ['misc.disciplinaryRecord', '是否有处分记录', 'misc', 'bool', ['是否有处分记录', '处分记录']],
    ['misc.criminalRecord', '是否有犯罪记录', 'misc', 'bool', ['是否有犯罪记录', '犯罪记录']],
    ['misc.relativeInCompany', '是否有亲属在本公司', 'misc', 'bool', ['是否有亲属在本公司', '是否有亲属在本公司工作', '本公司是否有亲属']],
    ['misc.conflictOfInterest', '是否存在利益冲突', 'misc', 'bool', ['是否存在利益冲突', '利益冲突']],
    ['misc.nonCompete', '是否存在竞业限制', 'misc', 'bool', ['是否存在竞业限制', '竞业限制协议']],
    ['misc.willingBackgroundCheck', '是否愿意背景调查', 'misc', 'bool', ['是否愿意背景调查', '愿意背景调查', '是否同意背景调查']],
    ['misc.willingTransferPost', '是否愿意调岗', 'misc', 'bool', ['是否愿意调岗', '愿意调岗']],
    ['misc.willingAllocation', '是否愿意服从分配', 'misc', 'bool', ['是否愿意服从分配', '是否服从工作地点分配', '服从分配', '是否服从分配']],
    ['misc.willingNightShift', '是否接受夜班', 'misc', 'bool', ['是否接受夜班', '能否接受夜班', '接受夜班']],
    ['misc.willingStoreWork', '是否接受门店工作', 'misc', 'bool', ['是否接受门店工作', '能否接受门店', '接受门店工作']],
    ['misc.interests', '兴趣爱好', 'misc', 'textarea', ['兴趣爱好', '兴趣', '爱好', '个人兴趣', 'hobbies']],
    ['misc.strengths', '特长', 'misc', 'textarea', ['特长', '个人特长', '特长爱好']],
    ['misc.selfEvaluation', '自我评价', 'misc', 'textarea', ['自我评价', '个人评价', '自我描述', '个人简介']],
    ['misc.personalAdvantage', '个人优势', 'misc', 'textarea', ['个人优势', '优势', '我的优势', '自身优势']],
    ['misc.personalSummary', '个人总结', 'misc', 'textarea', ['个人总结', '小结']],
    ['misc.careerPlan', '职业规划', 'misc', 'textarea', ['职业规划', '未来规划', '职业目标', '发展规划']],
    ['misc.jobMotivation', '求职动机', 'misc', 'textarea', ['求职动机', '申请动机', '为什么申请']],
    ['misc.maxAdvantage', '最大优势', 'misc', 'textarea', ['最大优势', '最突出优势']],
    ['misc.maxShortcoming', '最大不足', 'misc', 'textarea', ['最大不足', '最大缺点', '不足之处']],
    ['misc.otherDescription', '其他说明', 'misc', 'textarea', ['其他说明', '补充说明', '其他补充', '备注说明']],
  ];

  // 技能（§16）是分类结构：每个技能有熟练度/年限/场景/描述。技能名作为可选项，描述作为自由字段。
  const SKILL_CATEGORIES = {
    office: { name: '办公技能', items: ['Word', 'Excel', 'PowerPoint', 'WPS', 'Outlook', 'Visio'] },
    data: { name: '编程和数据', items: ['Python', 'SQL', 'JavaScript', 'Java', 'C++', 'R', '数据分析', '数据可视化', 'Excel高级', '统计分析'] },
    ai: { name: 'AI工具', items: ['ChatGPT', 'Claude', 'Gemini', '豆包', 'Codex', 'Coze', 'ComfyUI', 'Stable Diffusion', '通义千问', '其他AI工具'] },
    design: { name: '设计/视频', items: ['Photoshop', 'Illustrator', 'Figma', 'Premiere', '剪映', 'CapCut', 'Final Cut', 'Canva', 'AE'] },
    language: { name: '语言技能', items: ['英语', '日语', '韩语', '法语', '德语', '西班牙语', '普通话', '粤语'] },
    other: { name: '其他技能', items: ['项目管理', '时间管理', '演讲表达', '团队协作', '沟通协调', '公文写作', '活动策划'] },
  };

  // 组装成完整定义。commonQuestions 是"这个字段常被问成什么"，AI 开放题和映射时用。
  const COMMON_Q = {
    'misc.selfEvaluation': ['请做一个自我介绍', '自我评价', '个人简介', '请简单介绍一下你自己'],
    'misc.personalAdvantage': ['你的个人优势是什么', '个人优势', '你最大的优势'],
    'misc.jobMotivation': ['为什么申请这个岗位', '为什么选择我们公司', '求职动机', '为什么应聘这个岗位'],
    'misc.careerPlan': ['你的职业规划是什么', '职业规划', '未来三到五年的规划'],
    'misc.maxShortcoming': ['你的最大不足是什么', '最大缺点', '有什么需要改进的地方'],
    'education.school': ['你的毕业院校是哪所学校'],
    'employment.description': ['请描述你的实习/工作内容', '主要负责什么工作'],
  };

  function build() {
    return D.map(([fieldId, name, category, dataType, aliases, options]) => ({
      fieldId,
      name,
      category,
      dataType: dataType || 'text',
      aliases: aliases || [],
      options: options || null,
      commonQuestions: COMMON_Q[fieldId] || [name],
      // 下面这些是"该字段需要什么样的值"的行为约束，引擎的适配器会读
      formatRules: buildFormatRules(dataType),
      validationRules: buildValidation(dataType),
      // 默认允许 AI 建议修改"映射"，但不允许直接改"真实事实值"。资料页对真实字段默认锁定=见 §24/§25。
      aiEditable: dataType === 'text' || dataType === 'textarea',
    }));
  }

  function buildFormatRules(dataType) {
    switch (dataType) {
      case 'date': return { input: 'YYYY-MM-DD', display: ['YYYY年MM月DD日', 'YYYY/MM/DD', 'YYYY-MM-DD'] };
      case 'month': return { input: 'YYYY-MM', display: ['YYYY年MM月', 'YYYY-MM', 'YYYY.MM', 'MM/YYYY'] };
      case 'year': return { input: 'YYYY', display: ['YYYY', 'YYYY年'] };
      case 'phone': return { input: '1xxxxxxxxxx', validate: /^1[3-9]\d{9}$/ };
      case 'email': return { validate: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ };
      case 'idcard': return { validate: /^\d{17}[\dXx]$/ };
      case 'number': return { parse: Number };
      default: return {};
    }
  }

  function buildValidation(dataType) {
    const v = { required: false, type: dataType };
    if (dataType === 'phone') v.pattern = '^1[3-9]\\d{9}$';
    if (dataType === 'email') v.pattern = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
    if (dataType === 'idcard') v.pattern = '^\\d{17}[\\dXx]$';
    if (dataType === 'date' || dataType === 'month' || dataType === 'year') v.format = dataType === 'year' ? 'YYYY' : dataType === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    return v;
  }

  const CATEGORIES = {
    personal: { name: '基本信息', icon: '👤' },
    contact: { name: '联系方式', icon: '📞' },
    education: { name: '教育经历', icon: '🎓', list: true },
    employment: { name: '工作/实习经历', icon: '💼', list: true },
    campus: { name: '校园经历', icon: '🎪', list: true },
    projects: { name: '项目经历', icon: '📁', list: true },
    awards: { name: '获奖荣誉', icon: '🏆', list: true },
    certificates: { name: '证书', icon: '📜', list: true },
    languages: { name: '语言能力', icon: '🗣️', list: true },
    skills: { name: '技能', icon: '🛠️', special: 'skills' },
    job: { name: '求职意向', icon: '🎯' },
    family: { name: '家庭信息', icon: '👪', list: true },
    misc: { name: '其他', icon: '📝' },
  };

  // 把技能名也注册成可识别字段（fieldId = skills.<slug>），方便 AI 识别网页上的技能项。
  function buildSkillFields() {
    const out = [];
    for (const [cat, def] of Object.entries(SKILL_CATEGORIES)) {
      for (const item of def.items) {
        const slug = 'skills.' + item.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-');
        out.push({
          fieldId: slug,
          name: item,
          category: 'skills',
          skillCategory: cat,
          dataType: 'skill',
          aliases: [item, def.name + '·' + item],
          options: ['入门', '了解', '一般', '熟悉', '熟练', '精通'],
          commonQuestions: [item + '掌握程度如何'],
          formatRules: {},
          validationRules: { required: false, type: 'skill' },
          aiEditable: true,
        });
      }
    }
    return out;
  }

  const ALL = build().concat(buildSkillFields());
  const BY_ID = new Map(ALL.map(f => [f.fieldId, f]));
  const BY_CATEGORY = new Map();
  for (const f of ALL) {
    if (!BY_CATEGORY.has(f.category)) BY_CATEGORY.set(f.category, []);
    BY_CATEGORY.get(f.category).push(f);
  }

  // 建一个 label/别名 -> fieldId 的反向索引，供"网页字段文本 → 标准字段"匹配。
  // 长的别名优先匹配，避免"毕业时间"抢走"预计毕业时间"的匹配。
  const LABEL_INDEX = [];
  for (const f of ALL) {
    LABEL_INDEX.push({ text: f.name, fieldId: f.fieldId, weight: 100 });
    for (const a of f.aliases) LABEL_INDEX.push({ text: a, fieldId: f.fieldId, weight: (a.length >= 4 ? 90 : 60) });
  }
  LABEL_INDEX.sort((a, b) => b.text.length - a.text.length || b.weight - a.weight);

  function all() { return ALL; }
  function byId(id) { return BY_ID.get(id) || null; }
  function byCategory(cat) { return BY_CATEGORY.get(cat) || []; }
  function categories() { return CATEGORIES; }

  // 把一段网页标签文本匹配到标准字段。返回 {fieldId, confidence, matchedText} 或 null。
  // 纯规则，不调 AI —— AI 只在规则完全找不到时才上场（§50 优先级）。
  function matchLabel(label) {
    const t = String(label || '').replace(/\s+/g, '').toLowerCase();
    if (!t) return null;
    for (const entry of LABEL_INDEX) {
      const needle = entry.text.replace(/\s+/g, '').toLowerCase();
      if (t === needle) return { fieldId: entry.fieldId, confidence: 0.98, matchedText: entry.text };
    }
    for (const entry of LABEL_INDEX) {
      const needle = entry.text.replace(/\s+/g, '').toLowerCase();
      if (needle.length >= 3 && t.includes(needle)) return { fieldId: entry.fieldId, confidence: 0.85, matchedText: entry.text };
    }
    for (const entry of LABEL_INDEX) {
      const needle = entry.text.replace(/\s+/g, '').toLowerCase();
      if (needle.length >= 3 && needle.includes(t)) return { fieldId: entry.fieldId, confidence: 0.6, matchedText: entry.text };
    }
    return null;
  }

  root.ResumeFieldLibrary = { all, byId, byCategory, categories, matchLabel, SKILL_CATEGORIES, CATEGORIES, COMMON_Q, buildFormatRules, buildValidation };
})(typeof globalThis !== 'undefined' ? globalThis : this);
