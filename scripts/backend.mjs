import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
const child=spawn(process.env.GO_BINARY||'go',['-C','backend','run','./cmd/zephyr',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,UPLOAD_DIR:path.resolve(process.env.UPLOAD_DIR||'uploads'),LEGACY_UPLOAD_DIR:path.resolve(process.env.LEGACY_UPLOAD_DIR||'public/uploads')}});
child.on('error',error=>{console.error('Cannot start Go:',error.code);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
