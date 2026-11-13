import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
const children=[];
const go=process.env.GO_BINARY||'go';
const apiPort=process.env.PORT||'3000';
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),300).unref();}
function run(command,args,env){const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});children.push(child);child.on('error',error=>{console.error('Cannot start',command,error.code);stop(1)});child.on('exit',code=>{if(!stopping)stop(code||0)});return child;}
run(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3001'],{PORT:'3001'});
run(go,['-C','backend','run','./cmd/zephyr','serve'],{API_ADDR:`:${apiPort}`,UI_ORIGIN:'http://127.0.0.1:3001',UPLOAD_DIR:path.resolve(process.env.UPLOAD_DIR||'uploads'),LEGACY_UPLOAD_DIR:path.resolve(process.env.LEGACY_UPLOAD_DIR||'public/uploads')});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
