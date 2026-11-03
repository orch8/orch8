import {beforeAll, afterAll, it, expect, vi} from 'vitest';
import {setupTestDb, teardownTestDb, type TestDb} from './helpers/test-db.js';
import * as schema from '@orch/shared/db';
import {PipelineService} from '../services/pipeline.service.js';
import {PipelineTemplateService} from '../services/pipeline-template.service.js';
import {TaskService} from '../services/task.service.js';
import {TaskLifecycleService} from '../services/task-lifecycle.service.js';
import {BroadcastService} from '../services/broadcast.service.js';
import postgres from 'postgres';
import type { SchemaDb } from '../db/client.js';
import type { PipelineTx } from '../services/pipeline.service.js';
let db:TestDb, projectId:string, pipeline:PipelineService;
beforeAll(async()=>{db=await setupTestDb(); const [p]=await db.db.insert(schema.projects).values({name:'quality',slug:'quality',homeDir:'/tmp/quality'}).returning(); projectId=p.id; pipeline=new PipelineService(db.db,new PipelineTemplateService(db.db));},60000);
afterAll(async()=>teardownTestDb(db));
it('retains task transition broadcast for pipeline blocking',async()=>{
 const p=await pipeline.create({projectId,name:'broadcast',steps:[{label:'work'}]});
 const broadcast=new BroadcastService(new Set()); const spy=vi.spyOn(broadcast,'taskTransitioned');
 const lifecycle=new TaskLifecycleService(db.db,new TaskService(db.db),broadcast);
 await lifecycle.transition(p.firstTask.id,'blocked'); expect(spy).toHaveBeenCalledOnce();
});
it('broadcasts committed completion once, with no duplicate or failed event', async () => {
 const broadcast = new BroadcastService(new Set());
 const spy = vi.spyOn(broadcast, 'taskTransitioned');
 const service = new PipelineService(db.db, new PipelineTemplateService(db.db), broadcast);
 const p = await service.create({projectId, name:'completion events', steps:[{label:'work'}]});
 await service.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'done');
 expect(spy).toHaveBeenCalledExactlyOnceWith(projectId,{taskId:p.firstTask.id,from:'backlog',to:'done'});
 await service.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'replay');
 await expect(service.completeStep(p.pipeline.id,p.steps[0].id,'stale','late')).rejects.toThrow();
 expect(spy).toHaveBeenCalledOnce();
});
it('broadcasts block and resume only after commit', async () => {
 const p = await pipeline.create({projectId,name:'resume',steps:[{label:'work'}]});
 const broadcast = new BroadcastService(new Set());
 const spy = vi.spyOn(broadcast,'taskTransitioned');
 const lifecycle = new TaskLifecycleService(db.db,new TaskService(db.db),broadcast);
 await lifecycle.transition(p.firstTask.id,'blocked');
 await lifecycle.transition(p.firstTask.id,'backlog');
 expect(spy.mock.calls).toEqual([
  [projectId,{taskId:p.firstTask.id,from:'backlog',to:'blocked',agentId:undefined}],
  [projectId,{taskId:p.firstTask.id,from:'blocked',to:'backlog',agentId:undefined}],
 ]);
});
it('checkout emits a transition once and exact-run replay emits none', async () => {
 const [agent] = await db.db.insert(schema.agents).values({id:'lock-event-agent',projectId,name:'worker',role:'engineer'}).returning();
 const p = await pipeline.create({projectId,name:'checkout events',steps:[{label:'work',agentId:agent.id}]});
 const [run] = await db.db.insert(schema.heartbeatRuns).values({projectId,taskId:p.firstTask.id,agentId:agent.id,invocationSource:'on_demand',status:'running'}).returning();
 const broadcast = new BroadcastService(new Set());
 const spy = vi.spyOn(broadcast,'taskTransitioned');
 const lifecycle = new TaskLifecycleService(db.db,new TaskService(db.db),broadcast);
 await lifecycle.transition(p.firstTask.id,'in_progress',{agentId:agent.id,runId:run.id});
 expect(spy).toHaveBeenCalledExactlyOnceWith(projectId,{taskId:p.firstTask.id,from:'backlog',to:'in_progress',agentId:agent.id});
 await lifecycle.checkout(p.firstTask.id,agent.id,run.id);
 await lifecycle.release(p.firstTask.id,agent.id,run.id);
 expect(spy).toHaveBeenCalledOnce();
});
for (const operation of ['successor', 'verification', 'final', 'approve', 'reject', 'retry', 'transition'] as const) {
 it(`rolls back every write at callback return without events: ${operation}`, async () => {
  const p = await pipeline.create({projectId,name:'callback rollback',steps:
   operation === 'final' ? [{label:'one'}] : [{label:'one',requiresVerification:operation === 'verification' || operation === 'approve'},{label:'two'}]});
  if (operation === 'approve') await pipeline.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'review');
  if (operation === 'reject') await pipeline.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'advance');
  if (operation === 'retry') await pipeline.failStep(p.pipeline.id,p.steps[0].id,p.firstTask.id);
  const observer = postgres(db.connectionUri,{max:1});
  const snapshot = async () => ({
   project: await observer`SELECT * FROM projects WHERE id = ${projectId}`,
   pipelines: await observer`SELECT * FROM pipelines WHERE id = ${p.pipeline.id}`,
   steps: await observer`SELECT * FROM pipeline_steps WHERE pipeline_id = ${p.pipeline.id} ORDER BY id`,
   tasks: await observer`SELECT * FROM tasks WHERE pipeline_id = ${p.pipeline.id} ORDER BY id`,
  });
  const broadcast = new BroadcastService(new Set());
  const spy = vi.spyOn(broadcast,'taskTransitioned');
  const wrapped = new Proxy(db.db, { get(target,prop) {
   if (prop === 'transaction') return (fn:(tx:PipelineTx)=>Promise<unknown>) => target.transaction(async tx => {
    await fn(tx);
    expect(spy).not.toHaveBeenCalled();
    throw new Error('injected callback return failure');
   });
   const value = Reflect.get(target,prop); return typeof value === 'function' ? value.bind(target) : value;
  }}) as SchemaDb;
  const service = new PipelineService(wrapped,new PipelineTemplateService(db.db),broadcast);
  const lifecycle = new TaskLifecycleService(wrapped,new TaskService(db.db),broadcast);
  try {
   const before = await snapshot();
   const action = operation === 'approve' ? service.approveStep(p.pipeline.id,p.steps[0].id)
    : operation === 'reject' ? service.rejectStep(p.pipeline.id,p.steps[1].id,p.steps[0].id,'redo')
    : operation === 'retry' ? service.retry(p.pipeline.id)
    : operation === 'transition' ? lifecycle.transition(p.firstTask.id,'blocked')
    : service.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'done');
   await expect(action).rejects.toThrow('injected callback return failure');
   expect(await snapshot()).toEqual(before);
   expect(spy).not.toHaveBeenCalled();
  } finally { await observer.end(); }
 });
}
it.each(['completion','approval','retry','rejection'] as const)('%s and dependency creation do not deadlock',async(operation)=>{
 const p=await pipeline.create({projectId,name:'deadlock',steps:[{label:'one',requiresVerification:operation==='approval'},{label:'two'}]});
 let currentTaskId = p.firstTask.id;
 if (operation === 'approval' || operation === 'rejection') {
  const result = await pipeline.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'done');
  if (operation === 'rejection') currentTaskId = result.nextTask!.id;
 }
 if (operation === 'retry') await pipeline.failStep(p.pipeline.id,p.steps[0].id,p.firstTask.id);
 const [before] = await db.sql`SELECT next_task_number FROM projects WHERE id = ${projectId}`;
 let entered!:()=>void, release!:()=>void; const gate=new Promise<void>(r=>release=r), ready=new Promise<void>(r=>entered=r);
 let ownerPid=0;
 const wrapped=new Proxy(db.db,{get(target,prop){if(prop==='transaction')return (fn:any)=>target.transaction(async(tx:any)=>{
   const rows=await tx.execute((await import('drizzle-orm')).sql`select pg_backend_pid() as pid`); ownerPid=rows[0].pid;
   const proxy=new Proxy(tx,{get(t,k){if(k==='insert')return (table:any)=>table===schema.taskDependencies?{values:async(v:any)=>{entered(); await gate; return t.insert(table).values(v);}}:t.insert(table);const val=t[k];return typeof val==='function'?val.bind(t):val;}});
   return fn(proxy);
 });const val=Reflect.get(target,prop);return typeof val==='function'?val.bind(target):val;}});
 const creating=new TaskService(wrapped).createWithDependencies({projectId,title:'dependent',taskType:'quick'},[currentTaskId]);
 await ready;
 const completing = operation === 'approval' ? pipeline.approveStep(p.pipeline.id,p.steps[0].id)
  : operation === 'retry' ? pipeline.retry(p.pipeline.id)
  : operation === 'rejection' ? pipeline.rejectStep(p.pipeline.id,p.steps[1].id,p.steps[0].id,'redo')
  : pipeline.completeStep(p.pipeline.id,p.steps[0].id,p.firstTask.id,'done','done.md');
 const settled=Promise.allSettled([creating,completing]);
 try { const end=Date.now()+5000; while(true){ const waiting=await db.sql`SELECT pid FROM pg_stat_activity WHERE ${ownerPid}=ANY(pg_blocking_pids(pid))`;if(waiting.length)break;if(Date.now()>end)throw new Error('completion never waited on allocator');await new Promise(r=>setTimeout(r,10));} }finally{release();}
 const results=await settled;
 const failures=results.filter(r=>r.status==='rejected').map((r:any)=>({message:r.reason.message,cause:r.reason.cause?.message,code:r.reason.cause?.code}));
 console.log('DEADLOCK_PROBE',JSON.stringify(failures));expect(failures).toEqual([]);
 const [after] = await db.sql`SELECT next_task_number FROM projects WHERE id = ${projectId}`;
 expect(after.next_task_number).toBe(before.next_task_number + 2);
 const state = (await pipeline.getWithSteps(p.pipeline.id))!;
 const active = state.steps.find(s => s.order === state.pipeline.currentStep)!;
 const next = await new TaskService(db.db).getById(active.taskId!);
 expect(next).toMatchObject({projectId,pipelineId:p.pipeline.id,pipelineStepId:active.id,column:'backlog'});
 const edges = await db.sql`SELECT * FROM task_dependencies WHERE depends_on_id = ${currentTaskId}`;
 expect(edges).toHaveLength(1);
},15000);
