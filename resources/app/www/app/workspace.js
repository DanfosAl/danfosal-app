// Bootstrap shared by every rebuilt workspace (Stock, Sell, ...): shell, one data load, tabs,
// and a reload after each save so every screen shows the same, current numbers.
import { mountShell, setPipelineStatus, setSearchData, setNavCounts, navCountsFor } from './shell.js';
import { loadAll, analyze } from './data.js';
import { esc, icon } from './ui.js';

export function bootWorkspace({ active, title, tabs, defaultTab }) {
    const content = mountShell({ active });
    content.innerHTML = `
        <div class="page-head"><div><h1>${esc(title)}</h1><p id="ws-sub">Loading…</p></div><div id="ws-actions" class="toolbar"></div></div>
        <nav class="tabs" id="ws-tabs" aria-label="${esc(title)} sections"></nav>
        <div id="ws-body" style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <div class="skeleton" style="height:340px"></div></div>`;
    const body = content.querySelector('#ws-body');
    const ctx = {
        model: null, a: null, body,
        params: new URLSearchParams(window.location.search),
        setSub: html => { content.querySelector('#ws-sub').innerHTML = html; },
        setActions: html => { content.querySelector('#ws-actions').innerHTML = html; return content.querySelector('#ws-actions'); },
        reload: () => reload(),
        tab: null
    };

    function drawTabs() {
        const nav = content.querySelector('#ws-tabs');
        nav.innerHTML = tabs.map(t => {
            if (t.href) return `<a class="tab classic" href="${t.href}">${icon(t.icon)}${esc(t.label)}</a>`;
            const n = ctx.a && t.count ? t.count(ctx.a, ctx.model) : 0;
            return `<a class="tab" href="#${t.id}"${t.id === ctx.tab ? ' aria-current="page"' : ''}>${icon(t.icon)}${esc(t.label)}${n ? `<span class="count">${n}</span>` : ''}</a>`;
        }).join('');
    }

    function route() {
        const wanted = window.location.hash.slice(1);
        const tab = tabs.find(t => !t.href && t.id === wanted) || tabs.find(t => t.id === defaultTab);
        ctx.tab = tab.id;
        drawTabs();
        if (!ctx.model) return;
        ctx.setActions('');
        try { tab.render(ctx); }
        catch (error) {
            console.error(error);
            body.innerHTML = `<div class="error-box">${icon('error')}<div><b>This screen hit an error.</b><br><span>${esc(error.message)}</span></div></div>`;
        }
    }

    async function reload() {
        try {
            ctx.model = await loadAll();
            ctx.a = analyze(ctx.model);
            setSearchData(ctx.model);
            setPipelineStatus(ctx.a.lastEasypos, ctx.a.now);
            setNavCounts(active, navCountsFor(ctx.a));
            route();
        } catch (error) {
            console.error(error);
            body.innerHTML = `<div class="error-box">${icon('error')}<div><b>Couldn't load your data.</b><br><span>${esc(error.message)}. Check the internet connection, then try again.</span></div>
                <button class="btn small" type="button" id="retry" style="margin-left:auto">Try again</button></div>`;
            body.querySelector('#retry').addEventListener('click', reload);
        }
    }

    window.addEventListener('hashchange', route);
    route();
    reload();
    return ctx;
}
