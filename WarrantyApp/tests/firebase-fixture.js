// Browser-only in-memory SDK fixture. Never contacts Firebase.
const state=window.__mock ||= {records:window.__seed||{},writes:[],listeners:[],seq:0};
export class Timestamp { constructor(ms){this.seconds=Math.floor(ms/1000);this.nanoseconds=(ms%1000)*1e6;} toMillis(){return this.seconds*1000+this.nanoseconds/1e6;} toDate(){return new Date(this.toMillis());} static now(){return new Timestamp(Date.now());} static fromDate(d){return new Timestamp(d.getTime());} static fromMillis(ms){return new Timestamp(ms);} }
function copy(value){if(value==null)return value;if(value.$ms!=null)return new Timestamp(value.$ms);if(value.toMillis)return new Timestamp(value.toMillis());if(Array.isArray(value))return value.map(copy);if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)]));return value;}
function snapshot(ref){const data=state.records[ref.path];return {id:ref.id,ref,exists:()=>data!==undefined,data:()=>copy(data)};}
export const initializeApp=()=>({});export const getApps=()=>[];export const getFirestore=()=>({});
export const getAuth=()=>({onAuthStateChanged(callback){queueMicrotask(()=>callback({uid:'fixture'}));return ()=>{};}});
export const onAuthStateChanged=(auth,callback)=>auth.onAuthStateChanged(callback);export const signInAnonymously=async()=>({user:{uid:'fixture'}});
export function collection(base,...segments){const path=[base.path,...segments].filter(Boolean).join('/');return {path,id:path.split('/').at(-1)};}
export function doc(base,...segments){if(!segments.length)segments=[`new-${++state.seq}`];return collection(base,...segments);}
export const where=(field,op,value)=>({field,op,value});export const orderBy=(...args)=>({order:args});export const limit=count=>({limit:count});export const query=(ref,...filters)=>({...ref,filters});
export const getDoc=async ref=>snapshot(ref);
export async function getDocs(ref){let docs=Object.keys(state.records).filter(path=>path.startsWith(ref.path+'/')&&path.slice(ref.path.length+1).indexOf('/')<0).map(path=>snapshot({path,id:path.split('/').at(-1)}));for(const f of ref.filters||[]){if(f.field)docs=docs.filter(d=>f.op==='in'?f.value.includes(d.data()[f.field]):f.op==='=='?d.data()[f.field]===f.value:true);if(f.limit)docs=docs.slice(0,f.limit);}return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn),metadata:{fromCache:false}};}
function notify(){for(const [ref,fn] of state.listeners)getDocs(ref).then(fn);}
function apply(kind,ref,data){if(kind==='update'&&!state.records[ref.path])throw new Error('Missing document');state.records[ref.path]=kind==='update'?{...state.records[ref.path],...copy(data)}:copy(data);state.writes.push({kind,path:ref.path,data:copy(data)});}
export const addDoc=async(ref,data)=>{const target=doc(ref);apply('set',target,data);notify();return target;};
export const updateDoc=async(ref,data)=>{apply('update',ref,data);notify();};export const setDoc=async(ref,data)=>{apply('set',ref,data);notify();};
export async function runTransaction(db,callback){const pending=[];const tx={get:async ref=>snapshot(ref),set:(ref,data)=>pending.push(['set',ref,data]),update:(ref,data)=>pending.push(['update',ref,data])};const result=await callback(tx);pending.forEach(args=>apply(...args));notify();return result;}
export function onSnapshot(ref,next){const pair=[ref,next];state.listeners.push(pair);getDocs(ref).then(next);return ()=>{state.listeners=state.listeners.filter(x=>x!==pair);};}
