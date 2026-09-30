function skillLevelRank(text){
  const n=norm(text);if(!n)return null;
  if(/精通|专家|高级|expert|advanced/.test(n))return 4;
  if(/熟练|熟练掌握|proficient|verygood/.test(n))return 3;
  if(/熟悉|较熟悉|良好|familiar|good/.test(n))return 2;
  if(/基础|一般|入门|了解|初级|basic|beginner|novice/.test(n))return 1;
  return null;
}
const LEVEL_MAP={'基础':'一般','熟悉':'熟练','熟练':'熟练'};
function skillLevelOptionScore(text,value){
  if(LEVEL_MAP[String(value).trim()]===String(text).trim())return 155;
  const tr=skillLevelRank(value),or=skillLevelRank(text);if(tr==null||or==null)return 0;
  if(tr===or)return 148;
  // Conservative fallback: prefer the nearest level at or below the stored skill level.
  if(or<tr&&tr-or===1)return 106;
  return 0;
}
