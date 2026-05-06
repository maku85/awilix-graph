import type { DependencyGraph } from '../types';

export function formatHtml(graph: DependencyGraph): string {
	const allViolations = graph.violations ?? [];
	const violationErrors = allViolations.filter((v) => v.severity === 'error');
	const violationWarnings = allViolations.filter(
		(v) => v.severity === 'warning'
	);
	const nodeCount = graph.nodes.filter((n) => !n.missing).length;
	const missingCount = graph.nodes.filter((n) => n.missing).length;
	const edgeCount = graph.edges.length;
	const cycleCount = graph.cycles.length;

	const statsItems = [
		`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`,
		`${edgeCount} edge${edgeCount !== 1 ? 's' : ''}`,
		missingCount > 0 ? `${missingCount} missing` : null,
		cycleCount > 0 ? `${cycleCount} cycle${cycleCount !== 1 ? 's' : ''}` : null,
		allViolations.length > 0
			? `${allViolations.length} violation${allViolations.length !== 1 ? 's' : ''}`
			: null,
	]
		.filter(Boolean)
		.join(' · ');

	const esc = (s: string): string =>
		s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');

	// Escape </script> to prevent HTML injection when embedding JSON.
	const graphJson = JSON.stringify({
		nodes: graph.nodes,
		edges: graph.edges,
		cycles: graph.cycles,
		violations: allViolations,
	}).replace(/</g, '\\u003c');

	const violationsHtml =
		allViolations.length > 0
			? `
  <section class="issues violations${violationErrors.length === 0 ? ' warnings-only' : ''}">
    <h2>${violationErrors.length > 0 ? '✗' : '⚠'} Lifetime Violations — ${violationErrors.length} error${violationErrors.length !== 1 ? 's' : ''}, ${violationWarnings.length} warning${violationWarnings.length !== 1 ? 's' : ''}</h2>
    <ul>${allViolations.map((v) => `<li class="v-${v.severity}"><b>${esc(v.from)}</b> [${v.fromLifetime}] → <b>${esc(v.to)}</b> [${v.toLifetime}]</li>`).join('')}</ul>
  </section>`
			: '';

	const cyclesHtml =
		cycleCount > 0
			? `
  <section class="issues cycles">
    <h2>⚠ Cycles (${cycleCount})</h2>
    <ul>${graph.cycles.map((c) => `<li>${c.map(esc).join(' → ')} → ${esc(c[0])}</li>`).join('')}</ul>
  </section>`
			: '';

	const legendHtml = [
		{ color: '#a8d8a8', border: '#4a8a4a', label: 'class' },
		{ color: '#a8c4e8', border: '#2a6090', label: 'function' },
		{ color: '#f8d878', border: '#a07820', label: 'value' },
		{ color: '#d8b4fe', border: '#7c3aed', label: 'alias' },
		{ color: '#f0f0f0', border: '#aaaaaa', label: 'missing' },
		{ color: '#fca5a5', border: '#dc2626', label: 'error' },
	]
		.map(
			(e) =>
				`<span class="legend-item"><span class="legend-swatch" style="background:${e.color};border-color:${e.border}"></span>${e.label}</span>`
		)
		.join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>awilix-graph</title>
  <script src="https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; color: #111; }
    header { background: #1e1b4b; color: #fff; padding: 0.65rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    header h1 { font-size: 1rem; font-weight: 700; letter-spacing: 0.03em; }
    #search { flex: 1; min-width: 160px; max-width: 300px; padding: 0.3rem 0.65rem; border: 1px solid #4338ca; border-radius: 5px; background: #2d2a6a; color: #fff; font-size: 0.82rem; outline: none; }
    #search::placeholder { color: #a5b4fc; }
    #search:focus { border-color: #818cf8; }
    .stats { font-size: 0.76rem; color: #a5b4fc; margin-left: auto; white-space: nowrap; }
    .filter-bar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 0.4rem 1.5rem; display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .filter-label { font-size: 0.7rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .filter-btn, .toolbar-btn { padding: 0.18rem 0.55rem; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; font-size: 0.72rem; cursor: pointer; color: #374151; }
    .filter-btn.active { background: #4338ca; border-color: #4338ca; color: #fff; }
    .filter-btn:hover:not(.active), .toolbar-btn:hover:not(.active) { border-color: #6366f1; color: #4338ca; }
    .toolbar-btn.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
    .filter-sep { width: 1px; height: 18px; background: #e5e7eb; margin: 0 0.2rem; }
    .workspace { display: flex; }
    #graph-container { flex: 1; height: 72vh; min-height: 400px; background: #fafafa; }
    #detail-panel { width: 0; background: #fff; border-left: 1px solid #e5e7eb; overflow: hidden; transition: width 0.2s ease; display: flex; flex-direction: column; height: 72vh; min-height: 400px; }
    #detail-panel.open { width: 300px; }
    .dp-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.85rem 0.9rem 0.5rem; border-bottom: 1px solid #f0f0f0; gap: 0.5rem; }
    .dp-name { font-size: 0.95rem; font-weight: 700; font-family: monospace; word-break: break-all; }
    .dp-close { background: none; border: none; cursor: pointer; font-size: 1rem; color: #9ca3af; flex-shrink: 0; line-height: 1; }
    .dp-close:hover { color: #374151; }
    .dp-body { flex: 1; overflow-y: auto; padding: 0.65rem 0.9rem; font-size: 0.82rem; display: flex; flex-direction: column; gap: 0.65rem; }
    .dp-tags { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .dp-tag { display: inline-flex; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }
    .dp-section h3 { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; font-weight: 700; margin-bottom: 0.35rem; }
    .dp-list { list-style: none; }
    .dp-list li { display: flex; align-items: center; gap: 0.35rem; font-family: monospace; font-size: 0.79rem; cursor: pointer; padding: 0.18rem 0.3rem; border-radius: 3px; }
    .dp-list li:hover { background: #f3f4f6; }
    .dp-arrow { color: #9ca3af; font-size: 0.72rem; flex-shrink: 0; }
    .dp-lt { color: #9ca3af; font-size: 0.72rem; margin-left: 0.2rem; }
    .vbadge { font-size: 0.62rem; padding: 0.1rem 0.28rem; border-radius: 2px; color: #fff; margin-left: auto; flex-shrink: 0; }
    .vbadge-error { background: #e53e3e; }
    .vbadge-warning { background: #ed8936; }
    .dp-empty { color: #9ca3af; font-style: italic; font-size: 0.78rem; }
    .dp-noclick { cursor: default !important; }
    .dp-noclick:hover { background: none !important; }
    .issues { margin: 1rem 1.5rem; padding: 0.75rem 1.25rem; border-radius: 8px; }
    .issues.violations { background: #fff5f5; border: 1px solid #e53e3e; }
    .issues.violations.warnings-only { background: #fffaf0; border-color: #ed8936; }
    .issues.cycles { background: #fff7ed; border: 1px solid #f97316; }
    .issues h2 { font-size: 0.85rem; margin-bottom: 0.4rem; }
    .issues.violations h2 { color: #c53030; }
    .issues.violations.warnings-only h2 { color: #c05621; }
    .issues.cycles h2 { color: #c2410c; }
    .issues ul { padding-left: 1.2rem; font-size: 0.82rem; }
    .issues li { margin-bottom: 0.2rem; font-family: monospace; }
    .v-error { color: #7c2d12; }
    .v-warning { color: #92400e; }
    .issues.cycles li { color: #7c2d12; }
    footer { background: #1e1b4b; padding: 0.55rem 1.5rem; display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: center; margin-top: 1rem; }
    .legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: #c7d2fe; }
    .legend-swatch { display: inline-block; width: 11px; height: 11px; border-radius: 2px; border: 1.5px solid; }
    .legend-sep { color: #4338ca; }
    .legend-lt { font-size: 0.7rem; color: #a5b4fc; }
  </style>
</head>
<body>
  <header>
    <h1>awilix-graph</h1>
    <input type="search" id="search" placeholder="Search nodes… (press /)">
    <button class="toolbar-btn" id="btn-fit">⊞ Fit</button>
    <button class="toolbar-btn" id="btn-physics">⚡ Physics</button>
    <span class="stats">${statsItems}</span>
  </header>
  <div class="filter-bar">
    <span class="filter-label">Lifetime</span>
    <div id="filter-lifetime" style="display:flex;gap:0.35rem">
      <button class="filter-btn active" data-val="">All</button>
      <button class="filter-btn" data-val="SINGLETON">SINGLETON</button>
      <button class="filter-btn" data-val="SCOPED">SCOPED</button>
      <button class="filter-btn" data-val="TRANSIENT">TRANSIENT</button>
    </div>
    <div class="filter-sep"></div>
    <span class="filter-label">Type</span>
    <div id="filter-type" style="display:flex;gap:0.35rem">
      <button class="filter-btn active" data-val="">All</button>
      <button class="filter-btn" data-val="class">class</button>
      <button class="filter-btn" data-val="function">function</button>
      <button class="filter-btn" data-val="value">value</button>
      <button class="filter-btn" data-val="alias">alias</button>
      <button class="filter-btn" data-val="missing">missing</button>
    </div>
  </div>
  <div class="workspace">
    <div id="graph-container"></div>
    <aside id="detail-panel">
      <div class="dp-header">
        <span class="dp-name" id="dp-name"></span>
        <button class="dp-close" id="dp-close" aria-label="Close panel">×</button>
      </div>
      <div class="dp-body" id="dp-body"></div>
    </aside>
  </div>
  ${violationsHtml}
  ${cyclesHtml}
  <footer>
    ${legendHtml}
    <span class="legend-sep">|</span>
    <span class="legend-lt">border: SINGLETON=3px · SCOPED=2px · TRANSIENT=1px</span>
  </footer>
  <script>
    var GRAPH = ${graphJson};
    GRAPH.violations = GRAPH.violations || [];

    var TYPE_COLOR = {
      'class':    { bg: '#a8d8a8', bd: '#4a8a4a' },
      'function': { bg: '#a8c4e8', bd: '#2a6090' },
      'value':    { bg: '#f8d878', bd: '#a07820' },
      'alias':    { bg: '#d8b4fe', bd: '#7c3aed' },
      'missing':  { bg: '#f0f0f0', bd: '#aaaaaa' },
      'unknown':  { bg: '#f0f0f0', bd: '#aaaaaa' },
      'error':    { bg: '#fca5a5', bd: '#dc2626' }
    };
    var LIFETIME_BW = { SINGLETON: 3, SCOPED: 2, TRANSIENT: 1 };

    var violationMap = {};
    GRAPH.violations.forEach(function(v) { violationMap[v.from + '|' + v.to] = v; });

    var reverseDeps = {};
    GRAPH.nodes.forEach(function(n) { reverseDeps[n.name] = []; });
    GRAPH.edges.forEach(function(e) { if (reverseDeps[e.to]) reverseDeps[e.to].push(e.from); });

    var nodeMap = {};
    GRAPH.nodes.forEach(function(n) { nodeMap[n.name] = n; });

    function nodeColor(n, dim) {
      if (dim) return {
        background: '#e8e8e8', border: '#cccccc',
        highlight: { background: '#e8e8e8', border: '#aaaaaa' },
        hover:      { background: '#e8e8e8', border: '#aaaaaa' }
      };
      var c = TYPE_COLOR[n.type] || TYPE_COLOR['unknown'];
      return {
        background: c.bg, border: c.bd,
        highlight: { background: c.bg, border: '#1a1a1a' },
        hover:      { background: c.bg, border: c.bd }
      };
    }

    var visNodes = new vis.DataSet(GRAPH.nodes.map(function(n) {
      var bw  = LIFETIME_BW[n.lifetime] || 1;
      var lbl = n.lifetime
        ? n.name + '\\n(' + n.type + ' \\u00b7 ' + n.lifetime + ')'
        : n.name + '\\n(' + n.type + ')';
      return {
        id: n.name, label: lbl,
        color: nodeColor(n, false),
        shape: n.type === 'value' ? 'diamond' : n.type === 'function' ? 'ellipse' : 'box',
        borderWidth: bw,
        borderDashes: n.missing ? [5, 3] : false,
        font: { face: 'monospace', size: 11 },
        _type: n.type, _lt: n.lifetime || ''
      };
    }));

    var visEdges = new vis.DataSet(GRAPH.edges.map(function(e) {
      var v  = violationMap[e.from + '|' + e.to];
      var ec = v ? (v.severity === 'error' ? '#e53e3e' : '#ed8936') : '#aaaaaa';
      return {
        id: e.from + '|' + e.to, from: e.from, to: e.to,
        arrows: 'to',
        color: { color: ec, highlight: '#4a4a4a', hover: '#4a4a4a' },
        width: v ? 2 : 1,
        label: v ? v.fromLifetime + '\\u2192' + v.toLifetime : '',
        font: v ? { size: 9, color: ec, align: 'middle' } : { size: 0 }
      };
    }));

    var cyclesPresent = GRAPH.cycles.length > 0;
    var network = new vis.Network(
      document.getElementById('graph-container'),
      { nodes: visNodes, edges: visEdges },
      {
        layout: {
          hierarchical: cyclesPresent ? { enabled: false } : {
            enabled: true, direction: 'LR', sortMethod: 'directed',
            nodeSpacing: 110, levelSeparation: 190, blockShifting: true, edgeMinimization: true
          }
        },
        physics: {
          enabled: cyclesPresent,
          stabilization: { iterations: 300, fit: true },
          barnesHut: { gravitationalConstant: -4000, centralGravity: 0.1, springLength: 150 }
        },
        edges: {
          arrows: { to: { enabled: true, scaleFactor: 0.7 } },
          smooth: cyclesPresent
            ? { enabled: true, type: 'dynamic' }
            : { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 }
        },
        nodes: { margin: { top: 4, bottom: 4, left: 8, right: 8 } },
        interaction: { hover: true, tooltipDelay: 200, selectConnectedEdges: true }
      }
    );

    var physicsOn = cyclesPresent;
    var btnPhysics = document.getElementById('btn-physics');
    if (physicsOn) btnPhysics.classList.add('active');

    network.on('stabilizationIterationsDone', function() {
      network.setOptions({ physics: { enabled: false } });
      physicsOn = false;
      btnPhysics.classList.remove('active');
      network.fit();
    });

    // ── search & filter ────────────────────────────────────────────────────
    var searchQuery = '', filterLt = '', filterType = '';

    function applyFilters() {
      var q = searchQuery.toLowerCase();
      var nu = [], eu = [], visibleSet = {};
      GRAPH.nodes.forEach(function(n) {
        var ok = (!q || n.name.toLowerCase().indexOf(q) >= 0) &&
                 (!filterLt   || n.lifetime === filterLt) &&
                 (!filterType || n.type     === filterType);
        visibleSet[n.name] = ok;
        nu.push({ id: n.name, color: nodeColor(n, !ok), opacity: ok ? 1 : 0.15 });
      });
      GRAPH.edges.forEach(function(e) {
        eu.push({ id: e.from + '|' + e.to, hidden: !visibleSet[e.from] || !visibleSet[e.to] });
      });
      visNodes.update(nu);
      visEdges.update(eu);
    }

    document.getElementById('search').addEventListener('input', function(e) {
      searchQuery = e.target.value; applyFilters();
    });

    function makeFilterBar(groupId, key) {
      document.getElementById(groupId).addEventListener('click', function(e) {
        var btn = e.target.closest('.filter-btn');
        if (!btn) return;
        var val = btn.getAttribute('data-val');
        if (key === 'lt') filterLt   = filterLt   === val ? '' : val;
        else              filterType = filterType  === val ? '' : val;
        var active = key === 'lt' ? filterLt : filterType;
        document.querySelectorAll('#' + groupId + ' .filter-btn').forEach(function(b) {
          b.classList.toggle('active',
            b.getAttribute('data-val') === active ||
            (active === '' && b.getAttribute('data-val') === ''));
        });
        applyFilters();
      });
    }
    makeFilterBar('filter-lifetime', 'lt');
    makeFilterBar('filter-type', 'type');

    // ── toolbar ────────────────────────────────────────────────────────────
    document.getElementById('btn-fit').addEventListener('click', function() { network.fit(); });
    btnPhysics.addEventListener('click', function() {
      physicsOn = !physicsOn;
      network.setOptions({ physics: { enabled: physicsOn } });
      btnPhysics.classList.toggle('active', physicsOn);
    });

    // ── detail panel ───────────────────────────────────────────────────────
    function escHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function openPanel(name) {
      var n = nodeMap[name]; if (!n) return;
      document.getElementById('dp-name').textContent = name;
      var c = TYPE_COLOR[n.type] || TYPE_COLOR['unknown'];
      var tags =
        '<div class="dp-tags">' +
        '<span class="dp-tag" style="background:' + c.bg + ';border:1px solid ' + c.bd + '">' + escHtml(n.type) + '</span>' +
        (n.lifetime ? '<span class="dp-tag" style="background:' + c.bg + ';border:1px solid ' + c.bd + '">' + escHtml(n.lifetime) + '</span>' : '') +
        '</div>';

      function renderList(names, isOutgoing) {
        if (!names.length) return '<p class="dp-empty">None</p>';
        return '<ul class="dp-list">' + names.map(function(d) {
          var dn  = nodeMap[d];
          var v   = violationMap[isOutgoing ? name + '|' + d : d + '|' + name];
          var vb  = v ? '<span class="vbadge vbadge-' + v.severity + '">' + (v.severity === 'error' ? '\\u2717' : '!') + '</span>' : '';
          var lt  = dn && dn.lifetime ? '<span class="dp-lt">[' + escHtml(dn.lifetime) + ']</span>' : '';
          var arr = isOutgoing ? '\\u2192' : '\\u2190';
          return '<li data-node="' + escHtml(d) + '"><span class="dp-arrow">' + arr + '</span>' + escHtml(d) + lt + vb + '</li>';
        }).join('') + '</ul>';
      }

      var deps  = n.dependencies || [];
      var rdeps = reverseDeps[name] || [];
      var nodeViols = GRAPH.violations.filter(function(v) { return v.from === name || v.to === name; });
      var vh = nodeViols.length
        ? '<div class="dp-section"><h3>Violations (' + nodeViols.length + ')</h3><ul class="dp-list">' +
          nodeViols.map(function(v) {
            var col = v.severity === 'error' ? '#c53030' : '#c05621';
            return '<li class="dp-noclick" style="color:' + col + '">' +
              (v.severity === 'error' ? '\\u2717' : '!') + ' ' +
              escHtml(v.from) + ' [' + v.fromLifetime + '] \\u2192 ' + escHtml(v.to) + ' [' + v.toLifetime + ']</li>';
          }).join('') + '</ul></div>'
        : '';

      document.getElementById('dp-body').innerHTML =
        tags +
        '<div class="dp-section"><h3>Dependencies (' + deps.length + ')</h3>'  + renderList(deps,  true)  + '</div>' +
        '<div class="dp-section"><h3>Used by ('      + rdeps.length + ')</h3>' + renderList(rdeps, false) + '</div>' +
        vh;

      document.getElementById('detail-panel').classList.add('open');
      network.selectNodes([name]);
    }

    function closePanel() {
      document.getElementById('detail-panel').classList.remove('open');
      network.unselectAll();
    }

    document.getElementById('dp-close').addEventListener('click', closePanel);

    document.getElementById('dp-body').addEventListener('click', function(e) {
      var li = e.target.closest('[data-node]'); if (!li) return;
      var target = li.getAttribute('data-node');
      openPanel(target);
      network.focus(target, { scale: 1.2, animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    });

    network.on('click', function(params) {
      if (params.nodes.length)       openPanel(params.nodes[0]);
      else if (!params.edges.length) closePanel();
    });

    // ── keyboard shortcuts ─────────────────────────────────────────────────
    var searchEl = document.getElementById('search');
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (searchEl.value) { searchEl.value = ''; searchQuery = ''; applyFilters(); }
        else closePanel();
      }
      if (e.key === '/' && document.activeElement !== searchEl) {
        e.preventDefault(); searchEl.focus();
      }
    });
  </script>
</body>
</html>`;
}
