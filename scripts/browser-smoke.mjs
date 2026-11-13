import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.argv[2];
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{
 const a=await browser.newContext({viewport:{width:1440,height:1000}}),b=await browser.newContext({viewport:{width:1440,height:1000}});
 const alice=await a.newPage(),bob=await b.newPage();
 const errors=[];for(const page of [alice,bob]){page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=500)errors.push(response.status()+' '+response.url());});}
 async function login(page,name){await page.goto(base+'/');await page.getByRole('textbox',{name:'Логин',exact:true}).fill(name);await page.getByLabel('Пароль',{exact:true}).fill('password123');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.waitForURL('**/feed');await page.getByRole('heading',{name:/Твоя лента/}).waitFor();}
 await login(alice,'alice');await login(bob,'bob');
 await alice.getByRole('textbox',{name:'Текст нового поста'}).fill('Пост с настоящего Go API #go');await alice.getByRole('button',{name:'Опубликовать',exact:true}).click();await alice.getByText('Пост с настоящего Go API #go',{exact:true}).waitFor();console.log('Browser: login, session and post publication through Go passed');
 await alice.goto(base+'/messenger');await alice.locator('button').filter({has:alice.locator('svg.lucide-plus')}).first().click();await alice.getByPlaceholder('Поиск пользователей...').fill('bob');await alice.getByRole('button').filter({hasText:'bob'}).last().click();await alice.getByRole('button',{name:'Начать чат',exact:true}).click();await alice.getByRole('textbox',{name:'Сообщение',exact:true}).waitFor();
 await bob.goto(base+'/messenger');await bob.getByRole('button').filter({hasText:'alice'}).first().click();await bob.getByRole('textbox',{name:'Сообщение',exact:true}).waitFor();
 // Streams are opened by the list and the active chat; allow their initial resync to finish.
 await alice.waitForTimeout(300);
 const started=Date.now();await alice.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Сообщение через Go SSE');await alice.getByRole('button',{name:'Отправить сообщение',exact:true}).click();await bob.locator('[id^="message-"]').getByText('Сообщение через Go SSE',{exact:true}).waitFor({timeout:7000});assert(Date.now()-started<7000);assert.equal(await bob.locator('[id^="message-"]').getByText('Сообщение через Go SSE',{exact:true}).count(),1);console.log('Browser: message delivered to another account through SSE without waiting for polling');
 await bob.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Ответ через Go');await bob.getByRole('button',{name:'Отправить сообщение',exact:true}).click();await alice.locator('[id^="message-"]').getByText('Ответ через Go',{exact:true}).waitFor({timeout:7000});
 for(const width of [390,700,1440]){await alice.setViewportSize({width,height:900});assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 console.log('Browser: two-way chat and mobile layout passed');
 const sessions=await alice.request.get(base+'/api/auth/session');assert((await sessions.json()).user.id);
 assert.deepEqual(errors,[]);await a.close();await b.close();
}finally{await browser.close();}
