export const STATUS_LABELS={received:'Pa caktuar',in_progress:'Në servis',waiting_parts:'Presin pjesë',parts_received:'Pjesët mbërritën',completed:'Përfunduar',rejected:'Refuzuar',cancelled:'Anuluar'};
export const CLOSED_STATUSES=['completed','rejected','cancelled'];
// What the warranty card records for a finished repair: the parts that arrived (Danfosal App's
// Purchases fills them in from Kärcher's invoice), else the problem and the notes.
export function repairDescription(t,notes){const changed=(t.parts||[]).filter(p=>p&&p.name&&p.status==='received').map(p=>`${p.name}${Number(p.quantity)>1?' ×'+p.quantity:''}`);
    return changed.length?`U ndërrua: ${changed.join(', ')}${notes?' — '+notes:''}`:[t.issueDescription,notes].filter(Boolean).join(' — ');}
export function canonical(value){
    if(value==null)return null;
    if(value.toMillis)return value.toMillis();
    if(value instanceof Date)return value.getTime();
    if(Array.isArray(value))return value.map(canonical);
    if(typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
}
export function equal(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
export function changedFields(before,after){return Object.fromEntries(Object.entries(after).filter(([key,value])=>!equal(before[key],value)));}
export function assertNoConflicts(original,current,changes){
    const keys=Object.keys(changes).filter(key=>!equal(original[key],current[key]));
    if(keys.length)throw new Error('Kërkesa është ndryshuar nga një koleg. Rifreskoni faqen përpara se të ruani.');
}
export function normalizeParts(rows){
    return rows.map(p=>{const name=String(p.name||'').trim();const quantity=Number(p.quantity);if(!name||!Number.isInteger(quantity)||quantity<1)throw new Error('Çdo pjesë duhet të ketë emër dhe sasi të plotë, të paktën 1.');if(!['needed','ordered','received'].includes(p.status))throw new Error('Status i pavlefshëm i pjesës.');return {name,quantity,status:p.status,expectedOn:p.expectedOn||''};});
}
export function normalizeCosts(values){
    const result={currency:'EUR'};
    for(const key of ['parts','labour','supplierClaim','supplierReceived']){const n=Number(values[key]||0);if(!Number.isFinite(n)||n<0)throw new Error('Kostot duhet të jenë shuma pozitive ose zero.');result[key]=Math.round(n*100)/100;}
    return result;
}
export function customerDraft(t){
    const status=STATUS_LABELS[t.status]||'Në shqyrtim';
    const due=t.promisedBy?` Afati i planifikuar: ${t.promisedBy}.`:'';
    return `Përshëndetje ${t.customerName||''}, ju informojmë për ${t.productName||'makinën tuaj'} (${t.claimNo||'kërkesa e servisit'}). Statusi: ${status}.${due} Për pyetje, na kontaktoni. Faleminderit, Danfos.`;
}
