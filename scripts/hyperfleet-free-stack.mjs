#!/usr/bin/env node
// Offline capability planner: no network, no install, no secrets, no subprocess.
// This is a human-readable shortlist, NOT evidence that a candidate is installed.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const db=JSON.parse(fs.readFileSync(new URL('../ecosystem/hyperfleet/tool-catalog.json',import.meta.url),'utf8'));
export const specialistNames=['agent-runner','infocollect','IDEAZ','VAIZ','QAIZ','Mathematical-Physics-Lab-','genesisvault','presentationgen'];
const preferred={
  'agent-runner':['OpenCode','actionlint','OSV-Scanner','Zizmor'],
  'infocollect':['OSV-Scanner','SkillSpector','FreshRSS','Readability.js','Docling','sqlite-vec','Meilisearch','SearXNG'],
  'IDEAZ':['Readability.js','SearXNG','OSV-Scanner','RSSHub'],
  'VAIZ':['FFmpeg','ffprobe','whisper.cpp','Piper TTS','Blender','Kdenlive','Irodori-TTS-v4-Small','OSV-Scanner'],
  'QAIZ':['DuckDB','Polars','Pandera','PyMC','Hypothesis','OSV-Scanner'],
  'Mathematical-Physics-Lab-':['SymPy','Hypothesis','Lean 4','Z3','SageMath','OSV-Scanner'],
  'genesisvault':['Readability.js','OSV-Scanner','SkillSpector','Langfuse'],
  'presentationgen':['PptxGenJS','Marp','Slidev','OSV-Scanner']
};
const allowedModes=new Set(['open-source-self-host-or-review']);
export function buildZeroBudgetPlan(catalog,repo,limit=12) {
  if(!specialistNames.includes(repo))throw new Error('Unknown specialist: '+repo);
  const names=preferred[repo]||[];
  const byName=new Map(catalog.tools.map(t=>[t.name.toLowerCase(),t]));
  const rows=[];
  for(const name of names) {
    const t=byName.get(name.toLowerCase());
    if(!t)continue;
    const installed=t.runtime==='existing-capability-observed' && t.owner===repo;
    const free=allowedModes.has(t.freeMode) && Boolean(t.officialUrl);
    const status=installed?'ready':free?'review-candidate':'blocked-until-reviewed';
    rows.push({name:t.name,status,repo,provenance:t.source,freeMode:t.freeMode,officialUrl:t.officialUrl,why:installed?'Repository implementation observed':free?'OSS/source and licensing review required':'No verified zero-cost activation path'});
  }
  return {repo,budgetUSD:0,autoInstall:false,tools:rows.slice(0,limit),eligible:rows.filter(t=>t.status==='ready'||t.status==='review-candidate').length};
}

function cli(args) {
  const repoIndex=args.indexOf('--repo');
  const repo=repoIndex>=0?args[repoIndex+1]:undefined;
  if(!repo)throw new Error('Usage: node scripts/hyperfleet-free-stack.mjs --repo VAIZ [--json]');
  const result=buildZeroBudgetPlan(db,repo);
  if(args.includes('--json')) console.log(JSON.stringify(result,null,2));
  else {
    console.log('Hyperfleet '+repo+' | $0 paid API budget | no automatic installation');
    for(const row of result.tools)console.log(row.status.padEnd(25),row.name,row.officialUrl||'(source unverified)');
    console.log('Eligible: '+result.eligible+'/'+result.tools.length+' (requires human review unless ready)');
  }
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))){
  try{cli(process.argv.slice(2));}catch(err){console.error(err.message);process.exitCode=2;}
}
