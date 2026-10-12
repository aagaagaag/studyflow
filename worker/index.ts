import { Hono } from 'hono'
import { betterAuth } from 'better-auth'

interface Env {
  DB: D1Database
  RESOURCES: R2Bucket
  ASSETS: Fetcher
  APP_ORIGIN: string
  BETTER_AUTH_SECRET: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}
type User = { id:string; email:string; display_name:string; role:'student'|'owner' }
type Vars = { user:User }
const app = new Hono<{Bindings:Env;Variables:Vars}>()
const makeAuth=(env:Env)=>betterAuth({
  database:env.DB,
  baseURL:env.APP_ORIGIN,
  basePath:'/api/auth',
  secret:env.BETTER_AUTH_SECRET,
  trustedOrigins:[env.APP_ORIGIN],
  emailAndPassword:{
    enabled:true,
    minPasswordLength:8,
    revokeSessionsOnPasswordReset:true,
    sendResetPassword:async({user,url})=>{
      if(!env.RESEND_API_KEY)throw new Error('Password email is not configured. Set RESEND_API_KEY and RESEND_FROM.')
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM||'Studyflow <onboarding@resend.dev>',to:[user.email],subject:'Reset your Studyflow password',html:`<p>Use this link to choose a new password:</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, ignore this message.</p>`})})
      if(!response.ok)throw new Error('Password reset email delivery failed')
    }
  },
  user:{modelName:'users',additionalFields:{role:{type:['student','owner'],required:false,defaultValue:'student',input:false}}},
  session:{modelName:'sessions'},
  account:{modelName:'accounts'},
  verification:{modelName:'verifications'},
})
const fail=(message:string,status:400|401|403|404|409|413|415|500=400)=>new Response(JSON.stringify({error:message}),{status,headers:{'content-type':'application/json'}})
const ownerOnly=async(c:any,next:any)=>{if(c.get('user')?.role!=='owner')return fail('Owner access required',403);await next()}

// Better Auth owns registration, sign-in, sessions, sign-out and password recovery.
app.all('/api/auth/*',c=>makeAuth(c.env).handler(c.req.raw))
app.use('/api/*',async(c,next)=>{
  if(new URL(c.req.url).pathname.startsWith('/api/auth/'))return next()
  const origin=c.req.header('Origin')
  if(origin&&origin!==c.env.APP_ORIGIN)return fail('Origin not allowed',403)
  if(new URL(c.req.url).pathname==='/api/health')return next()
  const session=await makeAuth(c.env).api.getSession({headers:c.req.raw.headers})
  if(!session)return fail('Please sign in',401)
  const u=session.user as any
  c.set('user',{id:u.id,email:u.email,display_name:u.name,role:u.role==='owner'?'owner':'student'})
  await next()
})

app.get('/api/health',c=>c.json({ok:true}))
app.get('/api/me',c=>c.json({user:c.get('user')}))
app.get('/api/assignments',async c=>{
  const user=c.get('user')
  const {results}=await c.env.DB.prepare(`SELECT a.*,COALESCE(p.is_completed,0) AS is_completed FROM assignments a LEFT JOIN assignment_progress p ON p.assignment_id=a.id AND p.user_id=? WHERE a.status='published' ORDER BY CASE WHEN a.due_at IS NULL THEN 1 ELSE 0 END,a.due_at`).bind(user.id).all()
  const ids=results.map((x:any)=>x.id)
  const resources=ids.length?await c.env.DB.prepare(`SELECT id,assignment_id,title,url,description,resource_type FROM assignment_resources WHERE assignment_id IN (${ids.map(()=>'?').join(',')}) ORDER BY sort_order`).bind(...ids).all():{results:[]}
  return c.json({assignments:results.map((a:any)=>({...a,resources:resources.results.filter((r:any)=>r.assignment_id===a.id)}))})
})
app.put('/api/assignments/:id/progress',async c=>{
  const user=c.get('user'),assignmentId=c.req.param('id'),body=await c.req.json<any>()
  const exists=await c.env.DB.prepare("SELECT id FROM assignments WHERE id=? AND status='published'").bind(assignmentId).first()
  if(!exists)return fail('Assignment not found',404)
  const completed=body.completed?1:0
  await c.env.DB.prepare('INSERT INTO assignment_progress(assignment_id,user_id,is_completed,completed_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(assignment_id,user_id) DO UPDATE SET is_completed=excluded.is_completed,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP').bind(assignmentId,user.id,completed,completed?new Date().toISOString():null).run()
  return c.json({ok:true})
})
app.get('/api/personal-tasks',async c=>{const{results}=await c.env.DB.prepare('SELECT * FROM personal_tasks WHERE user_id=? ORDER BY due_at IS NULL,due_at,created_at DESC').bind(c.get('user').id).all();return c.json({tasks:results})})
app.post('/api/personal-tasks',async c=>{const u=c.get('user'),b=await c.req.json<any>();if(!String(b.title||'').trim()||String(b.title).length>160)return fail('Enter a title up to 160 characters');const taskId=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO personal_tasks(id,user_id,title,description,subject,due_at,priority) VALUES(?,?,?,?,?,?,?)').bind(taskId,u.id,String(b.title).trim(),String(b.description||''),String(b.subject||'Personal'),b.due_at||null,['Low','Medium','High'].includes(b.priority)?b.priority:'Medium').run();return c.json({id:taskId},201)})
app.patch('/api/personal-tasks/:id',async c=>{const u=c.get('user'),b=await c.req.json<any>(),allowed=['title','description','subject','due_at','priority','is_completed'],fields=allowed.filter(k=>Object.hasOwn(b,k));if(!fields.length)return fail('No changes provided');if(fields.includes('title')&&(!String(b.title).trim()||String(b.title).length>160))return fail('Enter a title up to 160 characters');if(fields.includes('is_completed'))b.is_completed=b.is_completed?1:0;const r=await c.env.DB.prepare(`UPDATE personal_tasks SET ${fields.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).bind(...fields.map(k=>k==='due_at'?(b[k]||null):b[k]),c.req.param('id'),u.id).run();return r.meta.changes?c.json({ok:true}):fail('Task not found',404)})
app.delete('/api/personal-tasks/:id',async c=>{const r=await c.env.DB.prepare('DELETE FROM personal_tasks WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('user').id).run();return r.meta.changes?c.json({ok:true}):fail('Task not found',404)})

app.get('/api/suggestions',async c=>{const u=c.get('user'),isOwner=u.role==='owner',sql=isOwner?'SELECT s.*,u.name AS submitter_name FROM assignment_suggestions s JOIN users u ON u.id=s.submitted_by ORDER BY s.created_at DESC':'SELECT * FROM assignment_suggestions WHERE submitted_by=? ORDER BY created_at DESC',result=isOwner?await c.env.DB.prepare(sql).all():await c.env.DB.prepare(sql).bind(u.id).all();return c.json({suggestions:result.results})})
app.post('/api/suggestions',async c=>{const u=c.get('user'),b=await c.req.json<any>();if(!String(b.title||'').trim()||!String(b.subject||'').trim())return fail('Title and subject are required');const count=await c.env.DB.prepare("SELECT count(*) AS n FROM assignment_suggestions WHERE submitted_by=? AND status='pending'").bind(u.id).first<any>();if(count.n>=10)return fail('Too many pending suggestions; wait for a review');const suggestionId=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO assignment_suggestions(id,submitted_by,title,subject,description,proposed_due_at) VALUES(?,?,?,?,?,?)').bind(suggestionId,u.id,String(b.title).trim(),String(b.subject).trim(),String(b.description||''),b.due_at||null).run();return c.json({id:suggestionId},201)})

app.get('/api/owner/assignments',ownerOnly,async c=>{const{results}=await c.env.DB.prepare("SELECT * FROM assignments WHERE status<>'archived' ORDER BY created_at DESC").all();return c.json({assignments:results})})
app.post('/api/owner/assignments',ownerOnly,async c=>{const u=c.get('user'),b=await c.req.json<any>();if(!String(b.title||'').trim()||!String(b.subject||'').trim())return fail('Title and subject are required');const assignmentId=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO assignments(id,title,subject,description,due_at,priority,status,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(assignmentId,String(b.title).trim(),String(b.subject).trim(),String(b.description||''),b.due_at||null,['Low','Medium','High'].includes(b.priority)?b.priority:'Medium',b.status==='draft'?'draft':'published',u.id).run();if(Array.isArray(b.resources))for(let i=0;i<b.resources.length;i++){const r=b.resources[i];if(r.url&&/^https?:\/\//i.test(r.url))await c.env.DB.prepare('INSERT INTO assignment_resources(id,assignment_id,title,url,description,sort_order) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),assignmentId,String(r.title||r.url),r.url,String(r.description||''),i).run()}return c.json({id:assignmentId},201)})
app.patch('/api/owner/assignments/:id',ownerOnly,async c=>{const b=await c.req.json<any>(),allowed=['title','subject','description','due_at','priority','status'],fields=allowed.filter(k=>Object.hasOwn(b,k));if(!fields.length)return fail('No changes provided');if(fields.includes('title')&&(!String(b.title).trim()||String(b.title).length>160))return fail('Enter a title up to 160 characters');if(fields.includes('subject')&&(!String(b.subject).trim()||String(b.subject).length>80))return fail('Enter a subject up to 80 characters');if(fields.includes('priority')&&!['Low','Medium','High'].includes(b.priority))return fail('Invalid priority');if(fields.includes('status')&&!['draft','published','archived'].includes(b.status))return fail('Invalid status');const r=await c.env.DB.prepare(`UPDATE assignments SET ${fields.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...fields.map(k=>k==='due_at'?(b[k]||null):b[k]),c.req.param('id')).run();return r.meta.changes?c.json({ok:true}):fail('Assignment not found',404)})
app.delete('/api/owner/assignments/:id',ownerOnly,async c=>{await c.env.DB.prepare("UPDATE assignments SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(c.req.param('id')).run();return c.json({ok:true})})
app.post('/api/owner/suggestions/:id/approve',ownerOnly,async c=>{const u=c.get('user'),sid=c.req.param('id'),aid=`approved-${sid}`,b=await c.req.json<any>().catch(()=>({}));await c.env.DB.prepare("UPDATE assignment_suggestions SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,reviewer_notes=?,approved_assignment_id=? WHERE id=? AND status='pending'").bind(u.id,b.notes||null,aid,sid).run();const inserted=await c.env.DB.prepare("INSERT OR IGNORE INTO assignments(id,title,subject,description,due_at,priority,status,created_by) SELECT ?,title,subject,description,proposed_due_at,'Medium','published',? FROM assignment_suggestions WHERE id=? AND status='approved' AND approved_assignment_id=?").bind(aid,u.id,sid,aid).run();return c.json({ok:true,created:inserted.meta.changes>0})})
app.post('/api/owner/suggestions/:id/reject',ownerOnly,async c=>{const u=c.get('user'),b=await c.req.json<any>().catch(()=>({})),r=await c.env.DB.prepare("UPDATE assignment_suggestions SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,reviewer_notes=? WHERE id=? AND status='pending'").bind(u.id,b.notes||null,c.req.param('id')).run();return r.meta.changes?c.json({ok:true}):fail('Suggestion is no longer pending',409)})
app.post('/api/owner/resources',ownerOnly,async c=>{const form=await c.req.formData(),file=form.get('file'),assignmentId=String(form.get('assignment_id')||'');if(!(file instanceof File)||!assignmentId)return fail('Choose a file and assignment');const assignment=await c.env.DB.prepare("SELECT id FROM assignments WHERE id=? AND status<>'archived'").bind(assignmentId).first();if(!assignment)return fail('Assignment not found',404);if(file.size>15*1024*1024)return fail('Files must be 15 MB or smaller',413);if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type))return fail('Allowed formats: PDF, PNG, JPG, WEBP',415);const key=`${assignmentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g,'_')}`;await c.env.RESOURCES.put(key,file.stream(),{httpMetadata:{contentType:file.type}});await c.env.DB.prepare("INSERT INTO assignment_resources(id,assignment_id,title,object_key,resource_type) VALUES(?,?,?,?, 'file')").bind(crypto.randomUUID(),assignmentId,file.name,key).run();return c.json({ok:true},201)})
app.get('/api/resources/:resourceId',async c=>{const r=await c.env.DB.prepare('SELECT ar.object_key,ar.title,a.status FROM assignment_resources ar JOIN assignments a ON a.id=ar.assignment_id WHERE ar.id=?').bind(c.req.param('resourceId')).first<any>();if(!r||!r.object_key||r.status!=='published')return fail('Resource not found',404);const obj=await c.env.RESOURCES.get(r.object_key);if(!obj)return fail('Resource not found',404);return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'application/octet-stream','content-disposition':`inline; filename="${r.title.replace(/["\\]/g,'')}"`,'cache-control':'private, max-age=300','x-content-type-options':'nosniff'}})})
app.all('/api/*',c=>fail('API route not found',404))
app.all('*',c=>c.env.ASSETS.fetch(c.req.raw))
export default app
