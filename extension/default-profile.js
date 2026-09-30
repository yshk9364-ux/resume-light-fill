globalThis.ResumePublicEdition=true;
globalThis.ResumeDefaultProfile=ResumeCore.emptyProfile();
for(const group of Object.keys(ResumeCore.groups))ResumeDefaultProfile[group]=[];
ResumeDefaultProfile.title='我的简历';
