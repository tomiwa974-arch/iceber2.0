import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../inertia/lib/specials.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const {DAY_MS, appendSpecial, activeSpecial, specialStatus, removeSpecial, moveSpecial} = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
const now = Date.parse('2026-10-27T12:00:00Z')
const draft = (id, durationDays = 1) => ({id,title:id,caption:'Special',image:'',price:15000,durationDays})
const queue = () => appendSpecial(appendSpecial(appendSpecial([],draft('first'),now),draft('second',3),now),draft('third'),now)

test('one-day default and multi-day posts transition at the exact boundary',()=>{
 const posts=queue()
 assert.equal(activeSpecial(posts,now).id,'first')
 assert.equal(activeSpecial(posts,now+DAY_MS-1).id,'first')
 assert.equal(specialStatus(posts[0],now+DAY_MS),'Expired')
 assert.equal(activeSpecial(posts,now+DAY_MS).id,'second')
 assert.equal(activeSpecial(posts,now+4*DAY_MS).id,'third')
 assert.equal(activeSpecial(posts,now+5*DAY_MS),undefined)
})
test('opening after multiple days selects the correct post without running background jobs',()=>{
 const posts=queue()
 assert.equal(activeSpecial(posts,now+3*DAY_MS).id,'second')
 const updated=appendSpecial(posts,draft('after-expiry',2),now+7*DAY_MS)
 assert.equal(updated.at(-1).startsAt,now+7*DAY_MS)
 assert.equal(updated.at(-1).endsAt,now+9*DAY_MS)
})
test('reordering and removing future posts preserves elapsed time and each duration',()=>{
 const midway=now+DAY_MS/2
 const moved=moveSpecial(queue(),'third',-1,midway)
 assert.equal(moved[0].endsAt,now+DAY_MS)
 assert.equal(activeSpecial(moved,now+DAY_MS).id,'third')
 assert.equal(activeSpecial(moved,now+2*DAY_MS).id,'second')
 const removed=removeSpecial(queue(),'second',midway)
 assert.equal(activeSpecial(removed,now+DAY_MS).id,'third')
 const ended=removeSpecial(queue(),'first',midway)
 assert.equal(activeSpecial(ended,midway).id,'second')
 assert.equal(ended[0].endsAt,midway+3*DAY_MS)
})
test('removing history never reschedules the live post',()=>{
 const posts=queue();const later=now+2*DAY_MS
 const result=removeSpecial(posts,'first',later)
 assert.equal(activeSpecial(result,later).startsAt,posts[1].startsAt)
 assert.equal(activeSpecial(result,later).endsAt,posts[1].endsAt)
})
test('invalid durations and prices cannot be scheduled',()=>{
 for(const days of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>appendSpecial([],draft('invalid',days),now))
 assert.throws(()=>appendSpecial([],{...draft('invalid'),price:NaN},now))
})
