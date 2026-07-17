/* ============================================================
   互动影游编辑器  Interactive Movie Editor
   Vanilla JS, no build step. Classic script (works on file://).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- layout constants (must match style.css) ---------- */
  var NODE_W = 230;
  var HEAD_H = 34;
  var MEDIA_H = 96;
  var CHOICE_H = 30;
  var CHOICES_PAD_TOP = 8;
  function portY(i) { return HEAD_H + MEDIA_H + CHOICES_PAD_TOP + i * CHOICE_H + CHOICE_H / 2; }

  /* ---------- AD SLOTS (edited in code only; NOT editable from the editor UI) ----------
     Two ad slots. For each, set src (image URL) and url (click-to-open link).
     Leave src empty to show the "广告位" placeholder; leave url empty to disable the jump. */
  var AD_CONFIG = [
    { src: "https://www.xkwo.com/data/attachment/portal/202601/22/083746j0r6c0xt9elet9l5.gif", url: "http://linxi9528.hkfree.work/" },
    { src: "https://img10.360buyimg.com/imgzone/jfs/t1/474321/37/12642/3801/6a52f969F4172f303/00831c2032640498.png", url: "http://linxi9528.hkfree.work/ds.html" }
  ];

  /* ---------- DOM refs ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("canvas"), world = $("world"), svg = $("edges"), nodesEl = $("nodes");
  var canvasWrap = $("canvasWrap"), propBody = $("propBody"), sceneList = $("sceneList");
  var projectNameInput = $("projectName"), zoomLabel = $("zoomLabel"), miniStatus = $("miniStatus");
  var sceneCount = $("sceneCount");

  /* ---------- state ---------- */
  var project = null;
  var selectedId = null;
  var view = { panX: 60, panY: 60, zoom: 1 };
  var _seq = 0;
  var _vseq = 0;

  function uid() { return "s" + (++_seq); }
  function vid() { return "v" + (++_vseq); }
  function getVar(id) {
    if (!project.variables) return null;
    for (var i = 0; i < project.variables.length; i++) if (project.variables[i].id === id) return project.variables[i];
    return null;
  }
  function getScene(id) {
    for (var i = 0; i < project.scenes.length; i++) if (project.scenes[i].id === id) return project.scenes[i];
    return null;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- sample project ---------- */
  function sampleProject() {
    var TRUST = "v1";
    var s = [
      { id: "s1", title: "雨夜来电", x: 60, y: 120,
        media: { type: "none", src: "" }, speaker: "未知来电", text: "凌晨两点，电话响起。一个陌生而急促的声音：「他们找到你了，快跑。」",
        choices: [ { id: "c1", label: "接起电话追问", target: "s2", effects: [], cond: null },
                   { id: "c2", label: "直接挂断出门", target: "s3", effects: [], cond: null } ] },
      { id: "s2", title: "追踪线索", x: 430, y: 50,
        media: { type: "none", src: "" }, speaker: "你", text: "电话那头只留下一个地址就挂断了。你决定去一探究竟。",
        choices: [ { id: "c3", label: "前往旧仓库（信任 +1）", target: "s4", effects: [ { varId: TRUST, op: "add", value: "1" } ], cond: null },
                   { id: "c4", label: "报警求助", target: "s5", effects: [], cond: null } ] },
      { id: "s3", title: "街头逃亡", x: 430, y: 330,
        media: { type: "none", src: "" }, speaker: "你", text: "你冲进雨里，身后的脚步声越来越近……",
        choices: [ { id: "c5", label: "躲进地铁站", target: "s5", effects: [], cond: null },
                   { id: "c6", label: "转身面对（信任 +1）", target: "s4", effects: [ { varId: TRUST, op: "add", value: "1" } ], cond: null } ] },
      { id: "s4", title: "正面交锋", x: 820, y: 180,
        media: { type: "none", src: "" }, speaker: "神秘人", text: "「你终于来了。其实，这一切都是为你准备的考验。」你的「信任」越高，越能触及真相。",
        choices: [ { id: "c7", label: "接受考验（信任 +1）", target: "s5", effects: [ { varId: TRUST, op: "add", value: "1" } ], cond: null },
                   { id: "c8", label: "直指幕后黑手", target: "s6", effects: [], cond: { varId: TRUST, cmp: ">=", value: "2" } } ] },
      { id: "s5", title: "真相", x: 1190, y: 80,
        media: { type: "none", src: "" }, speaker: "", text: "谜底揭晓，故事在此落幕。感谢游玩。（提示：提升「信任」可解锁隐藏结局）",
        choices: [] },
      { id: "s6", title: "隐藏真相", x: 1190, y: 360,
        media: { type: "none", src: "" }, speaker: "", text: "因为你赢得了足够的信任，幕后之人终于说出了全部真相……这是最好的结局。",
        choices: [] }
    ];
    return {
      name: "雨夜疑云（示例）", start: "s1",
      variables: [ { id: TRUST, name: "信任", type: "number", init: 0 } ],
      scenes: s
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderAll() {
    renderNodes();
    renderEdges();
    renderOutline();
    renderProps();
    updateStatus();
    renderAd();
  }

  /* ============================================================
     AD SLOT (horizontal banner, right of the project name)
     ============================================================ */
  function renderAd() {
    var slots = document.querySelectorAll("#toolbar .ad-slot");
    for (var i = 0; i < slots.length; i++) {
      var link = slots[i];
      var ad = AD_CONFIG[i] || { src: "", url: "" };
      var img = link.querySelector(".ad-img"), ph = link.querySelector(".ad-ph");
      if (ad.src) {
        img.onerror = function () { img.style.display = "none"; if (ph) ph.style.display = ""; };
        img.src = ad.src; img.style.display = "block";
        link.classList.add("has-img");
        if (ph) ph.style.display = "none";
      } else {
        img.onerror = null;
        img.removeAttribute("src"); img.style.display = "none";
        link.classList.remove("has-img");
        if (ph) ph.style.display = "";
      }
      if (ad.url) { link.href = ad.url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
      else { link.removeAttribute("href"); }
    }
  }

  function renderPlayAd() {
    // 试玩不展示广告：直接收起广告容器并清空所有广告位
    var cont = document.getElementById("playAds");
    if (cont) cont.style.display = "none";
    var slots = document.querySelectorAll("#playAds .play-ad");
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.remove("show");
      slots[i].innerHTML = "";
    }
  }

  function nodeMediaInner(m) {
    if (!m || m.type === "none" || !m.src) return '<span class="ph">（无媒体）</span>';
    if (m.type === "image") return '<img src="' + esc(m.src) + '" alt="">';
    if (m.type === "video") return '<span class="ph">🎞 视频片段</span>';
    return "";
  }

  function renderNodes() {
    var html = "";
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      var isStart = sc.id === project.start;
      var cls = "node" + (sc.id === selectedId ? " selected" : "") + (isStart ? " start" : "") + (sc.choices.length ? "" : " empty");
      var hasAudio = sc.audio && sc.audio.src;
      var audioFlag = hasAudio ? '<span class="a-flag" title="该场景配有旁白音频">🔊</span>' : '';
      var choicesHtml = "";
      for (var j = 0; j < sc.choices.length; j++) {
        var ch = sc.choices[j];
        var linked = ch.target ? " linked" : "";
        var hasEff = ch.effects && ch.effects.length;
        var flag = hasEff ? '<span class="ce-flag" title="选择后会修改变量">⚡</span>'
                          : (ch.cond ? '<span class="ce-flag cond" title="按条件出现">◆</span>' : '');
        choicesHtml +=
          '<div class="choice-row">' +
          '<span class="cnum">' + (j + 1) + '</span>' +
          '<span class="ctxt">' + esc(ch.label || "（未命名选项）") + '</span>' + flag +
          '<span class="port' + linked + '" data-scene="' + sc.id + '" data-choice="' + j + '" title="拖到目标场景建立分支"></span>' +
          '</div>';
      }
      html +=
        '<div class="' + cls + '" data-id="' + sc.id + '" style="left:' + sc.x + 'px;top:' + sc.y + 'px;">' +
        '<div class="node-head"><span class="title">' + esc(sc.title || "未命名") + '</span>' +
        (isStart ? '<span class="flag">START</span>' : '') + audioFlag + '</div>' +
        '<div class="node-media">' + nodeMediaInner(sc.media) + '</div>' +
        '<div class="node-choices">' + choicesHtml + '</div>' +
        '</div>';
    }
    nodesEl.innerHTML = html;
  }

  function edgeGeometry(sx, sy, tx, ty) {
    var dx = Math.max(50, Math.abs(tx - sx) * 0.5);
    var d = "M " + sx + " " + sy + " C " + (sx + dx) + " " + sy + " " + (tx - dx) + " " + ty + " " + tx + " " + ty;
    var ang = Math.atan2(ty - sy, dx);
    var a = 8;
    var p1x = tx - a * Math.cos(ang - 0.42), p1y = ty - a * Math.sin(ang - 0.42);
    var p2x = tx - a * Math.cos(ang + 0.42), p2y = ty - a * Math.sin(ang + 0.42);
    return { d: d, arrow: p1x + "," + p1y + " " + tx + "," + ty + " " + p2x + "," + p2y };
  }

  function renderEdges() {
    var parts = [];
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      for (var j = 0; j < sc.choices.length; j++) {
        var ch = sc.choices[j];
        if (!ch.target) continue;
        var tgt = getScene(ch.target);
        if (!tgt) continue;
        var sx = sc.x + NODE_W, sy = sc.y + portY(j);
        var tx = tgt.x, ty = tgt.y + HEAD_H / 2;
        var g = edgeGeometry(sx, sy, tx, ty);
        parts.push('<path class="edge-line" d="' + g.d + '"></path>');
        parts.push('<polygon class="edge-arrow" points="' + g.arrow + '"></polygon>');
        var lbl = (j + 1) + ". " + (ch.label || "");
        if (lbl.length > 16) lbl = lbl.slice(0, 15) + "…";
        parts.push('<text class="edge-label" x="' + (sx + 8) + '" y="' + (sy - 5) + '">' + esc(lbl) + '</text>');
      }
    }
    svg.innerHTML = parts.join("");
  }

  function renderOutline() {
    sceneCount.textContent = project.scenes.length;
    var html = "";
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      var isStart = sc.id === project.start;
      html +=
        '<li class="' + (isStart ? "start " : "") + (sc.id === selectedId ? "active" : "") + '" data-id="' + sc.id + '">' +
        '<span class="dot"></span>' +
        '<span class="nm">' + esc(sc.title || "未命名") + '</span>' +
        (isStart ? '<span class="tag">起点</span>' : '<span class="tag">' + sc.choices.length + '支</span>') +
        '</li>';
    }
    sceneList.innerHTML = html;
  }

  function mediaPreviewInner(m) {
    if (!m || m.type === "none" || !m.src) return '<span class="ph">（无媒体预览）</span>';
    if (m.type === "image") return '<img src="' + esc(m.src) + '" alt="">';
    if (m.type === "video") return '<video src="' + esc(m.src) + '" muted controls style="max-width:100%;max-height:100%"></video>';
    return "";
  }

  function renderProps() {
    var sc = selectedId ? getScene(selectedId) : null;
    if (!sc) { propBody.innerHTML = '<div class="empty-tip">选择一个场景节点<br>以编辑其属性。</div>'; return; }

    var m = sc.media || { type: "none", src: "" };
    var hasVars = project.variables && project.variables.length;
    var varArr = [];
    if (hasVars) for (var vi = 0; vi < project.variables.length; vi++) varArr.push([project.variables[vi].id, project.variables[vi].name]);
    var cmpArr = [["==", "等于"], ["!=", "不等于"], [">", "大于"], [">=", "不小于"], ["<", "小于"], ["<=", "不大于"], ["truthy", "为真"]];
    var opArr = [["set", "设为"], ["add", "＋加"], ["sub", "－减"], ["toggle", "取反"]];
    function sel(cls, f, idx, arr, selVal) {
      var h = '<select class="' + cls + '" data-f="' + f + '" data-idx="' + idx + '">';
      for (var i = 0; i < arr.length; i++) h += '<option value="' + esc(arr[i][0]) + '"' + (arr[i][0] === selVal ? " selected" : "") + '>' + esc(arr[i][1]) + '</option>';
      return h + '</select>';
    }

    var choicesHtml = "";
    for (var j = 0; j < sc.choices.length; j++) {
      var ch = sc.choices[j];
      if (!ch.effects) ch.effects = [];
      var opts = '<option value="">（未连接）</option>';
      for (var k = 0; k < project.scenes.length; k++) {
        var o = project.scenes[k];
        opts += '<option value="' + o.id + '"' + (o.id === ch.target ? " selected" : "") + '>' + esc(o.title || "未命名") + '</option>';
      }
      var effList = "";
      for (var e = 0; e < ch.effects.length; e++) {
        var ef = ch.effects[e], ev = getVar(ef.varId);
        var opTxt = { set: "设为", add: "＋", sub: "－", toggle: "取反" }[ef.op] || ef.op;
        effList += '<div class="eff-item">' + esc(ev ? ev.name : "(已删除)") + " " + opTxt + " " + esc(ef.value) +
          '<button class="ei-x" data-rmeff="' + j + ':' + e + '" title="删除效果">✕</button></div>';
      }
      var effAddHtml;
      if (hasVars) {
        effAddHtml =
          '<div class="eff-add">' +
          sel("ea-var", "effVar", j, varArr, "") +
          sel("ea-op", "effOp", j, opArr, "set") +
          '<input class="ea-val" type="text" data-f="effVal" data-idx="' + j + '" placeholder="值（取反可留空）">' +
          '<button class="btn small ea-btn" data-addeff="' + j + '">＋ 效果</button>' +
          '</div>';
      } else {
        effAddHtml = '<div class="sub-label">（无变量，点击工具栏「⚙ 变量」添加后可设置效果）</div>';
      }
      var cond = ch.cond;
      var condHtml =
        '<div class="cond-row">' +
        sel("cr-var", "condVar", j, [["", "（无条件，始终出现）"]].concat(varArr), cond ? cond.varId : "") +
        sel("cr-cmp", "condCmp", j, cmpArr, cond ? cond.cmp : "==") +
        '<input class="cr-val" type="text" data-f="condVal" data-idx="' + j + '" placeholder="值" value="' + esc(cond ? cond.value : "") + '">' +
        '</div>';
      choicesHtml +=
        '<div class="choice-edit" data-idx="' + j + '">' +
        '<div class="ce-head"><span class="num">选项 ' + (j + 1) + '</span>' +
        '<button class="ce-del" data-del="' + j + '" title="删除选项">🗑</button></div>' +
        '<div class="field"><input type="text" data-f="choiceLabel" data-idx="' + j + '" value="' + esc(ch.label) + '" placeholder="选项文字"></div>' +
        '<div class="field"><select data-f="choiceTarget" data-idx="' + j + '">' + opts + '</select></div>' +
        '<div class="sub-label">选择后修改变量（效果）</div>' +
        '<div class="eff-list">' + effList + '</div>' + effAddHtml +
        '<div class="sub-label">出现条件（满足才显示该选项）</div>' + condHtml +
        '</div>';
    }

    var mediaFields = "";
    if (m.type === "image") {
      mediaFields =
        '<div class="field"><input type="text" data-f="mediaUrl" value="' + esc(m.src) + '" placeholder="图片 URL（可留空改用本地文件）"></div>' +
        '<div class="field"><div class="row"><button class="btn small" id="pickImg">选择本地图片</button>' +
        '<input type="file" id="imgFile" accept="image/*" hidden></div></div>';
    } else if (m.type === "video") {
      mediaFields =
        '<div class="field"><input type="text" data-f="mediaUrl" value="' + esc(m.src) + '" placeholder="视频 URL（可留空改用本地文件）"></div>' +
        '<div class="field"><div class="row"><button class="btn small" id="pickVid">选择本地视频</button>' +
        '<input type="file" id="vidFile" accept="video/*" hidden></div></div>';
    }

    var chars = sc.characters || [];
    var charRows = "";
    for (var ci = 0; ci < chars.length; ci++) {
      var c = chars[ci];
      var cx = (c.x != null ? c.x : 50), cs = (c.scale || 0.5) * 100;
      charRows +=
        '<div class="char-edit" data-cid="' + c.id + '">' +
          '<img class="char-thumb" src="' + esc(c.src) + '" alt="">' +
          '<div class="char-ctrls">' +
            '<div class="char-row"><span class="cl">水平</span>' +
              '<input type="range" min="0" max="100" value="' + Math.round(cx) + '" data-f="charX" data-cid="' + c.id + '">' +
              '<span class="cval">' + Math.round(cx) + '%</span></div>' +
            '<div class="char-row"><span class="cl">大小</span>' +
              '<input type="range" min="15" max="90" value="' + Math.round(cs) + '" data-f="charScale" data-cid="' + c.id + '">' +
              '<span class="cval">' + Math.round(cs) + '%</span></div>' +
          '</div>' +
          '<button class="char-del" data-cdel="' + c.id + '" title="删除人物">✕</button>' +
        '</div>';
    }
    var charsHtml =
      '<div class="section-h">人物素材（叠加在画面上层）</div>' +
      '<div class="char-list">' + (charRows || '<div class="sub-label">尚无人物，点击下方按钮添加。</div>') + '</div>' +
      '<div class="field"><div class="row"><button class="btn small" id="pickChar">＋ 添加人物图片</button>' +
        '<input type="file" id="charFile" accept="image/*" hidden></div></div>' +
      '<div class="field"><input type="text" id="charUrl" placeholder="或粘贴图片 URL 后点添加"></div>' +
      '<div class="field"><button class="btn small" id="addCharUrl">添加 URL 人物</button></div>';

    propBody.innerHTML =
      '<div class="field"><label>场景标题</label><input type="text" data-f="title" value="' + esc(sc.title) + '"></div>' +
      '<div class="field"><label>说话者（可选）</label><input type="text" data-f="speaker" value="' + esc(sc.speaker) + '" placeholder="如：主角 / 旁白"></div>' +
      '<div class="field"><label>对白 / 旁白文本</label><textarea data-f="text" placeholder="在此输入该场景的台词或描述">' + esc(sc.text) + '</textarea></div>' +
      '<div class="section-h">媒体</div>' +
      '<div class="field"><select data-f="mediaType">' +
      '<option value="none"' + (m.type === "none" ? " selected" : "") + '>无</option>' +
      '<option value="image"' + (m.type === "image" ? " selected" : "") + '>图片</option>' +
      '<option value="video"' + (m.type === "video" ? " selected" : "") + '>视频</option>' +
      '</select></div>' +
      mediaFields +
      '<div class="media-preview" id="mediaPrev">' + mediaPreviewInner(m) + '</div>' +
      '<div class="section-h">音频旁白（朗读）</div>' +
      '<div class="field"><input type="text" data-f="audioUrl" value="' + esc((sc.audio && sc.audio.src) || "") + '" placeholder="音频 URL（可留空改用本地文件）"></div>' +
      '<div class="field"><div class="row"><button class="btn small" id="pickAudio">选择本地音频</button>' +
      '<input type="file" id="audFile" accept="audio/*" hidden></div></div>' +
      (sc.audio && sc.audio.src ?
        '<div class="field"><label class="start-toggle"><input type="checkbox" data-f="audioAuto"' + (sc.audio.autoplay !== false ? " checked" : "") + '> 进入场景自动朗读</label>' +
        '<button class="btn small" id="rmAudio" style="margin-left:8px">移除音频</button></div>' : '') +
      charsHtml +
      '<div class="section-h">分支选项</div>' +
      choicesHtml +
      '<button class="btn block" id="addChoice">＋ 添加选项</button>' +
      '<div class="danger-zone">' +
      '<label class="start-toggle"><input type="checkbox" id="setStart"' + (sc.id === project.start ? " checked" : "") + '> 设为起始场景</label>' +
      '<button class="btn danger block" id="delScene" style="margin-top:8px">删除此场景</button>' +
      '</div>';
  }

  function updateStatus() {
    var start = getScene(project.start);
    miniStatus.textContent = "场景：" + project.scenes.length + " · 起始：" + (start ? start.title : "未设置");
    projectNameInput.value = project.name;
  }

  /* ============================================================
     SELECTION
     ============================================================ */
  function selectScene(id) {
    selectedId = id;
    // update node/ outline selected classes without full rebuild
    var ns = nodesEl.querySelectorAll(".node");
    for (var i = 0; i < ns.length; i++) ns[i].classList.toggle("selected", ns[i].getAttribute("data-id") === id);
    var lis = sceneList.querySelectorAll("li");
    for (var k = 0; k < lis.length; k++) lis[k].classList.toggle("active", lis[k].getAttribute("data-id") === id);
    renderProps();
  }

  /* ============================================================
     CANVAS INTERACTIONS (pan / zoom / drag / connect)
     ============================================================ */
  function applyWorld() {
    world.style.transform = "translate(" + view.panX + "px," + view.panY + "px) scale(" + view.zoom + ")";
    zoomLabel.textContent = Math.round(view.zoom * 100) + "%";
  }
  function screenToWorld(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - view.panX) / view.zoom, y: (cy - r.top - view.panY) / view.zoom };
  }

  // pan + node drag + connect via delegation on #nodes / #canvas
  var drag = null;     // node drag
  var pan = null;      // canvas pan
  var conn = null;     // connecting choice

  canvas.addEventListener("mousedown", function (e) {
    // background pan
    if (e.target === canvas || e.target === world || e.target === svg || e.target === nodesEl) {
      pan = { sx: e.clientX, sy: e.clientY, ox: view.panX, oy: view.panY };
      canvas.classList.add("panning");
      e.preventDefault();
    }
  });

  nodesEl.addEventListener("mousedown", function (e) {
    var port = e.target.closest ? e.target.closest(".port") : null;
    var head = e.target.closest ? e.target.closest(".node-head") : null;
    var nodeEl = e.target.closest ? e.target.closest(".node") : null;
    if (!nodeEl) return;
    var id = nodeEl.getAttribute("data-id");
    e.stopPropagation();

    if (port) {
      var ci = parseInt(port.getAttribute("data-choice"), 10);
      var sc = getScene(id);
      var w = screenToWorld(e.clientX, e.clientY);
      conn = { from: id, ci: ci, sx: sc.x + NODE_W, sy: sc.y + portY(ci) };
      var g = edgeGeometry(conn.sx, conn.sy, w.x, w.y);
      var temp = document.createElementNS("http://www.w3.org/2000/svg", "path");
      temp.setAttribute("class", "edge-line temp");
      temp.setAttribute("d", g.d);
      temp.id = "tempEdge";
      svg.appendChild(temp);
      e.preventDefault();
      return;
    }

    // select
    selectScene(id);

    if (head) {
      var sc2 = getScene(id);
      drag = { id: id, sx: e.clientX, sy: e.clientY, ox: sc2.x, oy: sc2.y };
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", function (e) {
    if (pan) {
      view.panX = pan.ox + (e.clientX - pan.sx);
      view.panY = pan.oy + (e.clientY - pan.sy);
      applyWorld();
    } else if (drag) {
      var sc = getScene(drag.id);
      sc.x = drag.ox + (e.clientX - drag.sx) / view.zoom;
      sc.y = drag.oy + (e.clientY - drag.sy) / view.zoom;
      var el = nodesEl.querySelector('.node[data-id="' + drag.id + '"]');
      if (el) { el.style.left = sc.x + "px"; el.style.top = sc.y + "px"; }
      renderEdges();
    } else if (conn) {
      var w = screenToWorld(e.clientX, e.clientY);
      var g = edgeGeometry(conn.sx, conn.sy, w.x, w.y);
      var t = $("tempEdge");
      if (t) t.setAttribute("d", g.d);
    }
  });

  document.addEventListener("mouseup", function (e) {
    if (pan) { pan = null; canvas.classList.remove("panning"); save(); }
    if (drag) { drag = null; save(); }
    if (conn) {
      var tEl = $("tempEdge");
      if (tEl) tEl.remove();
      var elUnder = document.elementFromPoint(e.clientX, e.clientY);
      var targetNode = elUnder && elUnder.closest ? elUnder.closest(".node") : null;
      if (targetNode) {
        var tid = targetNode.getAttribute("data-id");
        if (tid && tid !== conn.from) {
          var sc = getScene(conn.from);
          if (sc && sc.choices[conn.ci]) { sc.choices[conn.ci].target = tid; }
        }
      }
      conn = null;
      renderEdges(); renderNodes(); renderProps(); save();
    }
  });

  // wheel zoom
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var wx = (mx - view.panX) / view.zoom, wy = (my - view.panY) / view.zoom;
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    var nz = Math.min(2.2, Math.max(0.3, view.zoom * factor));
    view.panX = mx - wx * nz; view.panY = my - wy * nz; view.zoom = nz;
    applyWorld();
  }, { passive: false });

  /* ============================================================
     OUTLINE click
     ============================================================ */
  sceneList.addEventListener("click", function (e) {
    var li = e.target.closest ? e.target.closest("li") : null;
    if (li) selectScene(li.getAttribute("data-id"));
  });

  /* ============================================================
     PROPERTIES editing (event delegation)
     ============================================================ */
  propBody.addEventListener("input", function (e) {
    var sc = selectedId ? getScene(selectedId) : null;
    if (!sc) return;
    var f = e.target.getAttribute("data-f");
    if (!f) return;
    if (f === "title") { sc.title = e.target.value; renderNodes(); renderOutline(); }
    else if (f === "speaker") { sc.speaker = e.target.value; }
    else if (f === "text") { sc.text = e.target.value; }
    else if (f === "mediaType") {
      sc.media = sc.media || { type: "none", src: "" };
      sc.media.type = e.target.value; sc.media.src = "";
      renderProps(); renderNodes();
    }
    else if (f === "mediaUrl") {
      sc.media = sc.media || { type: "none", src: "" };
      sc.media.src = e.target.value;
      var prev = $("mediaPrev"); if (prev) prev.innerHTML = mediaPreviewInner(sc.media);
      renderNodes();
    }
    else if (f === "audioUrl") {
      sc.audio = sc.audio || { src: "", autoplay: true };
      sc.audio.src = e.target.value;
      renderNodes();
    }
    else if (f === "choiceLabel") {
      var idx = parseInt(e.target.getAttribute("data-idx"), 10);
      if (sc.choices[idx]) { sc.choices[idx].label = e.target.value; renderNodes(); renderEdges(); }
    }
    else if (f === "choiceTarget") {
      var idx2 = parseInt(e.target.getAttribute("data-idx"), 10);
      if (sc.choices[idx2]) { sc.choices[idx2].target = e.target.value || null; renderNodes(); renderEdges(); }
    }
    else if (f === "condVar") {
      var jc = parseInt(e.target.getAttribute("data-idx"), 10);
      var chc = sc.choices[jc]; if (!chc) return;
      var v = e.target.value;
      if (!v) chc.cond = null;
      else { chc.cond = chc.cond || {}; chc.cond.varId = v; if (!chc.cond.cmp) chc.cond.cmp = "=="; if (chc.cond.value === undefined) chc.cond.value = ""; }
      renderProps(); save(); return;
    }
    else if (f === "condCmp") {
      var jm = parseInt(e.target.getAttribute("data-idx"), 10);
      var chm = sc.choices[jm]; if (!chm || !chm.cond) return;
      chm.cond.cmp = e.target.value; save(); return;
    }
    else if (f === "condVal") {
      var jv = parseInt(e.target.getAttribute("data-idx"), 10);
      var chv = sc.choices[jv]; if (!chv || !chv.cond) return;
      chv.cond.value = e.target.value; save(); return;
    }
    else if (f === "charX" || f === "charScale") {
      var cid = e.target.getAttribute("data-cid");
      var ch = findChar(sc, cid); if (!ch) return;
      if (f === "charX") ch.x = parseInt(e.target.value, 10);
      else ch.scale = parseInt(e.target.value, 10) / 100;
      var lbl = e.target.parentNode ? e.target.parentNode.querySelector(".cval") : null;
      if (lbl) lbl.textContent = Math.round(f === "charX" ? (ch.x != null ? ch.x : 50) : (ch.scale || 0.5) * 100) + "%";
      renderPlayChars(sc);
      save(); return;
    }
    save();
  });

  propBody.addEventListener("change", function (e) {
    if (e.target.id === "setStart") {
      if (e.target.checked && selectedId) { project.start = selectedId; renderOutline(); renderNodes(); }
    }
    else if (e.target.getAttribute("data-f") === "audioAuto") {
      sc_audio().autoplay = e.target.checked; save();
    }
  });
  function sc_audio() {
    var sc = selectedId ? getScene(selectedId) : null;
    if (!sc) return { src: "", autoplay: true };
    sc.audio = sc.audio || { src: "", autoplay: true };
    return sc.audio;
  }

  propBody.addEventListener("click", function (e) {
    var sc = selectedId ? getScene(selectedId) : null;
    if (!sc) return;
    if (e.target.id === "addChoice") {
      sc.choices.push({ id: uid(), label: "新选项", target: null, effects: [], cond: null });
      renderProps(); renderNodes(); renderEdges(); save();
    } else if (e.target.id === "delScene") {
      deleteScene(sc.id);
    } else if (e.target.getAttribute("data-del") != null) {
      var di = parseInt(e.target.getAttribute("data-del"), 10);
      sc.choices.splice(di, 1);
      renderProps(); renderNodes(); renderEdges(); save();
    } else if (e.target.id === "pickImg") {
      var f = $("imgFile"); if (f) f.click();
    } else if (e.target.id === "pickVid") {
      var f2 = $("vidFile"); if (f2) f2.click();
    } else if (e.target.id === "pickAudio") {
      var fa = $("audFile"); if (fa) fa.click();
    } else if (e.target.id === "rmAudio") {
      var sar = selectedId ? getScene(selectedId) : null;
      if (sar) { sar.audio = { src: "", autoplay: true }; renderProps(); renderNodes(); save(); }
    } else if (e.target.id === "pickChar") {
      var fc = $("charFile"); if (fc) fc.click();
    } else if (e.target.id === "addCharUrl") {
      var cu = $("charUrl"); var cuv = cu ? cu.value.trim() : "";
      if (!cuv) { alert("请先粘贴图片 URL"); return; }
      sc.characters = sc.characters || [];
      sc.characters.push({ id: uid(), src: cuv, x: 50, scale: 0.5 });
      renderProps(); renderNodes(); save();
    } else if (e.target.getAttribute("data-cdel") != null) {
      var cdel = e.target.getAttribute("data-cdel");
      sc.characters = (sc.characters || []).filter(function (c) { return c.id !== cdel; });
      renderProps(); renderNodes(); save();
    } else if (e.target.getAttribute("data-addeff") != null) {
      var ji = parseInt(e.target.getAttribute("data-addeff"), 10);
      var ce = e.target.closest ? e.target.closest(".choice-edit") : null;
      if (!ce) return;
      var vSel = ce.querySelector('[data-f="effVar"]');
      var oSel = ce.querySelector('[data-f="effOp"]');
      var vIn = ce.querySelector('[data-f="effVal"]');
      var vId = vSel ? vSel.value : "";
      if (!vId) { alert("请先选择变量"); return; }
      var chx = sc.choices[ji]; if (!chx) return;
      chx.effects = chx.effects || [];
      chx.effects.push({ varId: vId, op: oSel ? oSel.value : "set", value: vIn ? vIn.value : "" });
      renderProps(); renderNodes(); save();
    } else if (e.target.getAttribute("data-rmeff") != null) {
      var parts = e.target.getAttribute("data-rmeff").split(":");
      var pi = parseInt(parts[0], 10), pe = parseInt(parts[1], 10);
      var chp = sc.choices[pi]; if (chp && chp.effects) chp.effects.splice(pe, 1);
      renderProps(); renderNodes(); save();
    }
  });

  // local file -> data URL
  propBody.addEventListener("change", function (e) {
    var sc = selectedId ? getScene(selectedId) : null;
    if (!sc) return;
    if (e.target.id === "imgFile" && e.target.files && e.target.files[0]) {
      readFile(e.target.files[0], function (dataUrl) {
        sc.media = { type: "image", src: dataUrl };
        renderProps(); renderNodes(); save();
      });
    } else if (e.target.id === "vidFile" && e.target.files && e.target.files[0]) {
      readFile(e.target.files[0], function (dataUrl) {
        sc.media = { type: "video", src: dataUrl };
        renderProps(); renderNodes(); save();
      });
    } else if (e.target.id === "audFile" && e.target.files && e.target.files[0]) {
      readFile(e.target.files[0], function (dataUrl) {
        sc.audio = { src: dataUrl, autoplay: true };
        renderProps(); renderNodes(); save();
      });
    } else if (e.target.id === "charFile" && e.target.files && e.target.files[0]) {
      readFile(e.target.files[0], function (dataUrl) {
        sc.characters = sc.characters || [];
        sc.characters.push({ id: uid(), src: dataUrl, x: 50, scale: 0.5 });
        renderProps(); renderNodes(); save();
      });
    }
  });

  function readFile(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.readAsDataURL(file);
  }

  function deleteScene(id) {
    if (!confirm("确定删除该场景？所有指向它的分支会被清空。")) return;
    // clear incoming targets
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      for (var j = 0; j < sc.choices.length; j++) if (sc.choices[j].target === id) sc.choices[j].target = null;
    }
    project.scenes = project.scenes.filter(function (s) { return s.id !== id; });
    if (project.start === id) project.start = project.scenes.length ? project.scenes[0].id : null;
    if (selectedId === id) selectedId = null;
    renderAll(); save();
  }

  /* ============================================================
     TOOLBAR
     ============================================================ */
  $("btnAddScene").addEventListener("click", function () {
    var n = project.scenes.length;
    var id = uid();
    var x = view.panX + 80, y = view.panY + 80;
    // place new node near viewport center
    var r = canvas.getBoundingClientRect();
    x = (r.width / 2 - view.panX) / view.zoom - NODE_W / 2;
    y = (r.height / 2 - view.panY) / view.zoom - 60;
    project.scenes.push({ id: id, title: "新场景 " + (n + 1), x: Math.round(x), y: Math.round(y),
      media: { type: "none", src: "" }, speaker: "", text: "", choices: [] });
    renderAll();
    selectScene(id);
    save();
  });

  projectNameInput.addEventListener("input", function () { project.name = projectNameInput.value; save(); });

  $("btnPlay").addEventListener("click", startPlay);
  $("btnNew").addEventListener("click", function () {
    if (!confirm("新建将清空当前作品，确定？")) return;
    var id = uid();
    project = { name: "未命名作品", start: id, variables: [], scenes: [ { id: id, title: "开场", x: 80, y: 80, media: { type: "none", src: "" }, speaker: "", text: "", choices: [] } ] };
    selectedId = id; renderAll(); save();
  });
  $("btnSave").addEventListener("click", function () {
    flash("正在保存…");
    saveNow(function (ok) {
      if (ok) flash("已保存到本地");
      else { flash("保存失败"); alert("保存失败：浏览器存储空间不足或被禁用。\n建议使用「导出」保存为 .json 文件作为备份。"); }
    });
  });
  $("btnOpen").addEventListener("click", function () { load(function () { flash("已从本地恢复"); }); });
  $("btnExport").addEventListener("click", exportJSON);
  $("btnExportPlayer").addEventListener("click", exportPlayer);
  $("btnImport").addEventListener("click", function () { $("fileInput").click(); });
  $("fileInput").addEventListener("change", function (e) {
    if (!e.target.files || !e.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var data = JSON.parse(fr.result);
        if (!data.scenes) throw new Error("格式错误");
        project = normalizeProject(data);
        if (!project.start) project.start = project.scenes[0] ? project.scenes[0].id : null;
        reindexSeq(); selectedId = null; renderAll(); save();
      } catch (err) { alert("导入失败：" + err.message); }
    };
    fr.readAsText(e.target.files[0]);
    e.target.value = "";
  });

  $("btnZoomIn").addEventListener("click", function () { zoomBy(1.15); });
  $("btnZoomOut").addEventListener("click", function () { zoomBy(1 / 1.15); });
  $("btnZoomFit").addEventListener("click", fitView);
  function zoomBy(f) {
    var r = canvas.getBoundingClientRect();
    var mx = r.width / 2, my = r.height / 2;
    var wx = (mx - view.panX) / view.zoom, wy = (my - view.panY) / view.zoom;
    var nz = Math.min(2.2, Math.max(0.3, view.zoom * f));
    view.panX = mx - wx * nz; view.panY = my - wy * nz; view.zoom = nz; applyWorld();
  }

  function fitView() {
    if (!project.scenes.length) return;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (var i = 0; i < project.scenes.length; i++) {
      var s = project.scenes[i];
      var el = nodesEl.querySelector('.node[data-id="' + s.id + '"]');
      var h = el ? el.offsetHeight : 200;
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + NODE_W); maxY = Math.max(maxY, s.y + h);
    }
    var r = canvas.getBoundingClientRect();
    var pad = 60;
    var bw = maxX - minX, bh = maxY - minY;
    var z = Math.min(2.2, Math.max(0.3, Math.min((r.width - pad * 2) / bw, (r.height - pad * 2) / bh)));
    view.zoom = isFinite(z) ? z : 1;
    view.panX = (r.width - bw * view.zoom) / 2 - minX * view.zoom;
    view.panY = (r.height - bh * view.zoom) / 2 - minY * view.zoom;
    applyWorld();
  }

  /* ============================================================
     VARIABLES MODAL
     ============================================================ */
  function renderVarModal() {
    var list = $("varList");
    if (!list) return;
    if (!project.variables.length) {
      list.innerHTML = '<div class="sub-label">还没有变量。在下方添加，例如「信任 / 数值 / 0」。</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < project.variables.length; i++) {
      var v = project.variables[i];
      var typeOpts = '<option value="number"' + (v.type === "number" ? " selected" : "") + '>数值</option>' +
                     '<option value="bool"' + (v.type === "bool" ? " selected" : "") + '>开关</option>' +
                     '<option value="text"' + (v.type === "text" ? " selected" : "") + '>文本</option>';
      html +=
        '<div class="var-item" data-vid="' + v.id + '">' +
        '<input type="text" data-f="vname" value="' + esc(v.name) + '" placeholder="变量名">' +
        '<select data-f="vtype">' + typeOpts + '</select>' +
        '<input type="text" class="vi-init" data-f="vinit" value="' + esc(v.init) + '" placeholder="初始值">' +
        '<button class="vi-del" data-delvar="' + v.id + '" title="删除变量">🗑</button>' +
        '</div>';
    }
    list.innerHTML = html;
  }

  function onVarListEdit(e) {
    var item = e.target.closest ? e.target.closest(".var-item") : null;
    if (!item) return;
    var v = getVar(item.getAttribute("data-vid"));
    if (!v) return;
    var f = e.target.getAttribute("data-f");
    if (f === "vname") v.name = e.target.value;
    else if (f === "vtype") v.type = e.target.value;
    else if (f === "vinit") v.init = e.target.value;
    save();
  }
  function onVarListClick(e) {
    var dv = e.target.getAttribute("data-delvar");
    if (!dv) return;
    if (!confirm("删除该变量？所有引用它的选项效果与条件会被清理。")) return;
    project.variables = project.variables.filter(function (x) { return x.id !== dv; });
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      for (var j = 0; j < sc.choices.length; j++) {
        var c = sc.choices[j];
        if (c.effects) c.effects = c.effects.filter(function (ef) { return ef.varId !== dv; });
        if (c.cond && c.cond.varId === dv) c.cond = null;
      }
    }
    renderVarModal(); renderProps(); save();
  }

  $("btnVars").addEventListener("click", function () { renderVarModal(); $("varModal").classList.remove("hidden"); });
  $("varClose").addEventListener("click", function () { $("varModal").classList.add("hidden"); });
  $("varDone").addEventListener("click", function () { $("varModal").classList.add("hidden"); });
  $("varList").addEventListener("input", onVarListEdit);
  $("varList").addEventListener("change", onVarListEdit);
  $("varList").addEventListener("click", onVarListClick);
  $("addVar").addEventListener("click", function () {
    var nm = $("newVarName").value.trim();
    if (!nm) { alert("请填写变量名"); return; }
    var type = $("newVarType").value;
    var init = $("newVarInit").value;
    project.variables.push({ id: vid(), name: nm, type: type, init: init });
    $("newVarName").value = "";
    $("newVarInit").value = type === "bool" ? "false" : "0";
    renderVarModal(); save();
  });

  /* ============================================================
     PLAY MODE
     ============================================================ */
  var playStack = [];
  var playState = {};
  var playCtrlBound = false, playCtrlTimer = null;
  function revealPlayControls() {
    var c = document.querySelector(".play-controls"); if (c) c.classList.add("show");
    if (playCtrlTimer) clearTimeout(playCtrlTimer);
    playCtrlTimer = setTimeout(function () { if (c) c.classList.remove("show"); }, 2600);
  }
  var playOverlay = $("playOverlay");
  var playAudioEl = null;

  function coerceVal(v, type) {
    if (type === "number") return Number(v) || 0;
    if (type === "bool") return (v === true || v === "true");
    return String(v == null ? "" : v);
  }
  function initPlayState() {
    playState = {};
    (project.variables || []).forEach(function (v) { playState[v.id] = coerceVal(v.init, v.type); });
    renderPlayState();
  }
  function applyEffects(ch) {
    if (!ch.effects) return;
    ch.effects.forEach(function (ef) {
      var v = getVar(ef.varId); if (!v) return;
      var cur = playState[ef.varId];
      if (ef.op === "set") playState[ef.varId] = coerceVal(ef.value, v.type);
      else if (ef.op === "add") playState[ef.varId] = (Number(cur) || 0) + (Number(ef.value) || 0);
      else if (ef.op === "sub") playState[ef.varId] = (Number(cur) || 0) - (Number(ef.value) || 0);
      else if (ef.op === "toggle") playState[ef.varId] = !cur;
    });
    renderPlayState();
  }
  function condMet(c) {
    if (!c || !c.varId) return true;
    var v = getVar(c.varId); if (!v) return true;
    var cur = playState[c.varId], cmp = c.cmp || "==", val = c.value;
    if (cmp === "truthy") return !!cur;
    if (v.type === "number") {
      var a = Number(cur) || 0, b = Number(val) || 0;
      if (cmp === "==") return a === b;
      if (cmp === "!=") return a !== b;
      if (cmp === ">") return a > b;
      if (cmp === ">=") return a >= b;
      if (cmp === "<") return a < b;
      if (cmp === "<=") return a <= b;
      return true;
    }
    if (v.type === "bool") {
      var bv = (val === true || val === "true");
      if (cmp === "==") return !!cur === bv;
      if (cmp === "!=") return !!cur !== bv;
      return !!cur;
    }
    var s = String(cur == null ? "" : cur), t = String(val == null ? "" : val);
    if (cmp === "==") return s === t;
    if (cmp === "!=") return s !== t;
    if (cmp === ">") return s > t;
    if (cmp === "<") return s < t;
    return true;
  }
  function renderPlayState() {
    var el = $("playState");
    if (!el) return;
    var vars = project.variables || [];
    if (!vars.length) { el.style.display = "none"; el.innerHTML = ""; return; }
    el.style.display = "flex";
    var html = "";
    for (var i = 0; i < vars.length; i++) {
      var v = vars[i], val = playState[v.id];
      var disp = v.type === "bool" ? (val ? "开" : "关") : (val == null ? "" : String(val));
      html += '<span class="chip"><span class="ck">' + esc(v.name) + '</span><span class="cv">' + esc(disp) + '</span></span>';
    }
    el.innerHTML = html;
  }

  function startPlay() {
    if (!project.start || !getScene(project.start)) { alert("请先设置一个起始场景（在属性面板勾选“设为起始场景”）。"); return; }
    playStack = [];
    initPlayState();
    playOverlay.classList.remove("hidden");
    renderPlayAd();
    if (!playCtrlBound) {
      playCtrlBound = true;
      document.addEventListener("mousemove", revealPlayControls);
      document.addEventListener("touchstart", revealPlayControls, { passive: true });
      document.addEventListener("keydown", revealPlayControls);
    }
    revealPlayControls();
    showPlay(project.start);
    // Safety net: if a browser blocks the autoplay triggered by this click,
    // resume the narration on the first interaction inside the play overlay.
    playOverlay.addEventListener("pointerdown", function resume() {
      if (playAudioEl && playAudioEl.paused && playAudioEl.src) playAudioEl.play().catch(function () {});
    }, { once: true });
  }
  function findChar(sc, cid) {
    var cs = (sc && sc.characters) || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === cid) return cs[i];
    return null;
  }
  function renderPlayChars(sc) {
    var wrap = $("playChars"); if (!wrap) return;
    var chars = (sc && sc.characters) || [];
    var h = "";
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      h += '<img class="play-char" src="' + esc(c.src) + '" alt="" style="left:' + (c.x != null ? c.x : 50) + '%;height:' + ((c.scale || 0.5) * 100) + '%">';
    }
    wrap.innerHTML = h;
  }

  function showPlay(id) {
    var sc = getScene(id);
    if (!sc) return;
    var media = $("playMediaBox") || $("playMedia");
    var videoCtl = $("playVideoCtl");
    if (sc.media && sc.media.type !== "none" && sc.media.src) {
      if (sc.media.type === "image") media.innerHTML = '<img src="' + esc(sc.media.src) + '" alt="">';
      else if (sc.media.type === "video") {
        media.innerHTML = '<video src="' + esc(sc.media.src) + '" autoplay playsinline></video>';
        var vEl = media.querySelector("video");
        if (vEl && videoCtl) {
          videoCtl.classList.remove("hidden");
          var rv = $("playReplayVid");
          rv.style.display = "none";
          vEl.addEventListener("ended", function () { rv.style.display = ""; });
          rv.onclick = function () { vEl.currentTime = 0; vEl.play().catch(function () {}); rv.style.display = "none"; };
        }
      }
    } else {
      media.innerHTML = '<span class="ph">（无媒体）</span>';
      if (videoCtl) videoCtl.classList.add("hidden");
    }
    renderPlayChars(sc);
    $("playSpeaker").textContent = sc.speaker || "";
    $("playSpeaker").style.display = sc.speaker ? "block" : "none";
    $("playText").textContent = sc.text || "";

    // audio narration
    var audioWrap = $("playAudio");
    if (sc.audio && sc.audio.src) {
      audioWrap.classList.remove("hidden");
      if (!playAudioEl) playAudioEl = new Audio();
      playAudioEl.pause();
      playAudioEl.src = sc.audio.src;
      audioWrap.innerHTML =
        '<button id="paToggle" class="btn small">▶ 播放旁白</button>' +
        '<button id="paReplay" class="btn small">↺ 重听</button>' +
        '<span class="pa-label">🔊 该场景配有旁白音频</span>';
      var paToggle = $("paToggle"), paReplay = $("paReplay");
      function paLabel() { if (paToggle) paToggle.textContent = (playAudioEl.paused ? "▶ 播放旁白" : "⏸ 暂停"); }
      paToggle.addEventListener("click", function () {
        if (playAudioEl.paused) playAudioEl.play().catch(function () {}); else playAudioEl.pause();
        paLabel();
      });
      paReplay.addEventListener("click", function () { playAudioEl.currentTime = 0; playAudioEl.play().catch(function () {}); paLabel(); });
      playAudioEl.onended = paLabel; playAudioEl.onplay = paLabel; playAudioEl.onpause = paLabel;
      if (sc.audio.autoplay !== false) playAudioEl.play().then(paLabel).catch(paLabel); else paLabel();
    } else {
      if (playAudioEl) playAudioEl.pause();
      audioWrap.classList.add("hidden");
      audioWrap.innerHTML = "";
    }

    var box = $("playChoices");
    box.innerHTML = "";
    var active = sc.choices.filter(function (c) { return c.target && condMet(c.cond); });
    if (active.length === 0) {
      var end = document.createElement("div");
      end.className = "end";
      var hadTarget = sc.choices.some(function (c) { return c.target; });
      end.textContent = hadTarget ? "（当前条件不满足，无可用选项 · 剧终）" : "—— 剧终 ——";
      box.appendChild(end);
    } else {
      for (var i = 0; i < active.length; i++) {
        (function (ch) {
          var b = document.createElement("button");
          b.textContent = ch.label || "（继续）";
          b.addEventListener("click", function () {
            playStack.push(id);
            applyEffects(ch);
            showPlay(ch.target);
          });
          box.appendChild(b);
        })(active[i]);
      }
    }
  }
  $("playExit").addEventListener("click", function () { if (playAudioEl) playAudioEl.pause(); playOverlay.classList.add("hidden"); });
  $("playRestart").addEventListener("click", function () { if (playAudioEl) playAudioEl.pause(); playStack = []; initPlayState(); showPlay(project.start); });
  $("playBack").addEventListener("click", function () {
    if (playStack.length) { if (playAudioEl) playAudioEl.pause(); showPlay(playStack.pop()); }
    else { if (playAudioEl) playAudioEl.pause(); playOverlay.classList.add("hidden"); }
  });

  /* ============================================================
     PERSISTENCE
     ============================================================ */
  // Persistence uses IndexedDB (holds large base64 media reliably; localStorage
  // has a ~5MB quota that silently overflows once images/video are embedded).
  // localStorage is kept only as a fallback for tiny projects / private modes.
  var LS_KEY = "ime_project_v1";
  var DB_NAME = "ime_db", DB_STORE = "projects", DB_KEY = "current";
  var _db = null, _dbTried = false, _saveTimer = null;

  function openDB(cb) {
    if (_db) { cb(_db); return; }
    if (_dbTried && !window.indexedDB) { cb(null); return; }
    _dbTried = true;
    try {
      if (!window.indexedDB) { cb(null); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { _db = req.result; cb(_db); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }

  // Debounced background save (called throughout the editor on every change).
  function save() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () { saveNow(); }, 200);
  }

  // Immediate save with real success/failure feedback. cb(ok, errMsg).
  function saveNow(cb) {
    cb = cb || function () {};
    openDB(function (db) {
      if (!db) { cb(saveLS()); return; }
      try {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(project, DB_KEY);
        tx.oncomplete = function () {
          // keep a lightweight LS copy too (best-effort, ignore quota errors)
          try { localStorage.setItem(LS_KEY, JSON.stringify(project)); } catch (e) {}
          cb(true);
        };
        tx.onerror = function () { cb(saveLS()); };
        tx.onabort = function () { cb(saveLS()); };
      } catch (e) { cb(saveLS()); }
    });
  }

  function saveLS() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(project)); return true; }
    catch (e) { return false; }
  }

  // Async load. cb() runs after project is populated + rendered.
  function load(cb) {
    cb = cb || function () {};
    openDB(function (db) {
      if (!db) { loadLSorSample(); cb(); return; }
      try {
        var tx = db.transaction(DB_STORE, "readonly");
        var rq = tx.objectStore(DB_STORE).get(DB_KEY);
        rq.onsuccess = function () {
          var d = rq.result;
          if (d && d.scenes) { project = normalizeProject(d); reindexSeq(); renderAll(); cb(); }
          else { loadLSorSample(); cb(); }
        };
        rq.onerror = function () { loadLSorSample(); cb(); };
      } catch (e) { loadLSorSample(); cb(); }
    });
  }

  function loadLSorSample() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.scenes) { project = normalizeProject(d); reindexSeq(); renderAll(); return; }
      }
    } catch (e) {}
    project = sampleProject(); reindexSeq(); renderAll();
  }
  function exportJSON() {
    var data = JSON.stringify(project, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = (project.name || "interactive-story") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ============================================================
     EXPORT · SINGLE-FILE PLAYER
     Produces a self-contained HTML the user can double-click to play,
     with no editor and no network dependency (media stored as data URLs
     travel inside the embedded JSON).
     ============================================================ */
  var PLAYER_CSS = [
    ":root{--bg:#23262e;--bg-2:#1f222a;--panel:#23262e;--line:#2c313b;--accent:#7c5cff;--accent-2:#13c2c2;--grad:linear-gradient(135deg,#7c5cff,#13c2c2);--text:#e8ebf2;--muted:#98a1b3;--chip:#1b2433;--sh-dark:#16181d;--sh-light:#30343f;--nm-out:6px 6px 12px var(--sh-dark),-6px -6px 12px var(--sh-light);--nm-out-sm:4px 4px 8px var(--sh-dark),-4px -4px 8px var(--sh-light);--nm-out-lg:11px 11px 24px var(--sh-dark),-11px -11px 24px var(--sh-light);--nm-in:inset 5px 5px 10px var(--sh-dark),inset -5px -5px 10px var(--sh-light);--nm-in-sm:inset 3px 3px 6px var(--sh-dark),inset -3px -3px 6px var(--sh-light);--nm-in-lg:inset 7px 7px 15px var(--sh-dark),inset -7px -7px 15px var(--sh-light);}",
    "*{box-sizing:border-box;margin:0;padding:0;}",
    "html,body{height:100%;}",
    "body{background:var(--bg);color:var(--text);font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;}",
    "#floatbar{position:fixed;right:18px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:30;opacity:0;pointer-events:none;transition:opacity .25s ease;}",
    "#floatbar.show{opacity:1;pointer-events:auto;}",
    "#floatBtns{display:flex;flex-direction:column;gap:10px;}",
    "#floatBtns button{background:var(--bg);color:var(--text);border:none;border-radius:12px;padding:10px 14px;font-size:13px;cursor:pointer;box-shadow:var(--nm-out-sm);transition:.15s;white-space:nowrap;}",
    "#floatBtns button:hover{box-shadow:var(--nm-out);color:#fff;}",
    "#floatBtns button:active{box-shadow:var(--nm-in-sm);}",
    "#stage{position:relative;flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:20px;padding:28px 24px;background:var(--bg);}",
    "#center{display:flex;flex-direction:column;align-items:center;gap:18px;width:100%;}",
    ".media{position:relative;width:min(960px,90vw);aspect-ratio:16/9;background:var(--bg-2);box-shadow:var(--nm-in-lg);border:none;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}",
    ".media-box{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;}",
    ".media-box img,.media-box video{width:100%;height:100%;object-fit:contain;display:block;}",
    ".chars{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;}",
    ".char{position:absolute;bottom:4%;left:50%;transform:translateX(-50%);height:50%;max-width:62%;width:auto;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5));}",
    ".media .ph{color:var(--muted);font-size:14px;}",
    ".ad-row{width:min(1200px,96vw);display:flex;gap:14px;flex-wrap:wrap;justify-content:center;flex:0 0 auto;}",
    ".ad-banner{display:none;position:relative;flex:1 1 0;min-width:280px;height:64px;border-radius:10px;overflow:hidden;text-decoration:none;background:linear-gradient(90deg,#8a6bff,#22d3ee);}",
    ".ad-banner.show{display:block;}",
    ".ad-banner img{width:100%;height:100%;object-fit:cover;display:block;position:relative;z-index:1;}",
    ".ad-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;letter-spacing:2px;padding:0 14px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:0;}",
    ".dock{width:min(860px,92vw);display:flex;flex-direction:column;align-items:center;gap:12px;padding:0;}",
    ".hud{position:absolute;left:10px;top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;z-index:5;max-width:90%;}",
    ".chip{background:var(--bg);box-shadow:var(--nm-in-sm);border:none;border-radius:999px;padding:5px 12px;font-size:13px;display:flex;gap:6px;align-items:center;}",
    ".chip .ck{color:var(--muted);} .chip .cv{color:var(--accent-2);font-weight:700;}",
    ".caption{position:absolute;left:0;right:0;bottom:0;z-index:6;background:transparent;border:none;text-align:center;padding:18px 16px 20px;color:var(--text);text-shadow:0 1px 6px rgba(0,0,0,.65);}",
    ".speaker{color:var(--accent);font-weight:700;font-size:15px;margin-bottom:8px;}",
    ".text{font-size:17px;line-height:1.75;white-space:pre-wrap;}",
    ".choices{width:min(860px,92vw);display:flex;flex-direction:column;align-items:center;gap:10px;}",
    ".choice{width:100%;background:var(--bg);box-shadow:var(--nm-out-sm);border:none;border-radius:12px;padding:14px 18px;color:var(--text);font-size:15px;text-align:center;cursor:pointer;transition:.15s;}",
    ".choice:hover{box-shadow:var(--nm-out);color:#fff;}",
    ".choice:active{box-shadow:var(--nm-in-sm);}",
    ".end{width:100%;text-align:center;color:var(--muted);font-size:16px;padding:14px;letter-spacing:2px;}",
    ".audio{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;}",
    ".vid-ctl{display:flex;justify-content:center;}",
    ".vid-ctl.hidden{display:none;}",
    ".vid-replay{background:var(--bg);box-shadow:var(--nm-out-sm);border:none;border-radius:10px;padding:10px 18px;color:var(--text);font-size:14px;cursor:pointer;transition:.15s;}",
    ".vid-replay:hover{box-shadow:var(--nm-out);}",
    ".audio.hidden{display:none;}",
    ".aud-btn{background:var(--bg);box-shadow:var(--nm-out-sm);border:none;border-radius:8px;padding:7px 13px;cursor:pointer;color:var(--text);font-size:13px;transition:.15s;}",
    ".aud-btn:hover{box-shadow:var(--nm-out);color:#fff;}",
    ".aud-label{color:var(--muted);font-size:13px;}",
    ".ending{position:fixed;inset:0;background:rgba(6,9,14,.93);display:flex;align-items:center;justify-content:center;z-index:50;}",
    ".ending.hidden{display:none;}",
    ".end-card{text-align:center;background:var(--bg);box-shadow:var(--nm-out-lg);border:none;border-radius:20px;padding:40px 56px;}",
    ".end-emoji{font-size:46px;margin-bottom:8px;}",
    ".end-title{font-size:22px;font-weight:700;letter-spacing:4px;margin-bottom:8px;}",
    ".end-sub{color:var(--muted);margin-bottom:22px;}",
    ".big-btn{background:var(--grad);color:#fff;border:none;border-radius:10px;padding:12px 26px;font-size:15px;cursor:pointer;}",
    ".big-btn:hover{filter:brightness(1.1);}",
    ".start-screen{display:none;}",
    "@media(max-width:560px){#floatbar{right:8px;top:auto;bottom:14px;transform:none;flex-direction:row;}#floatBtns{flex-direction:row;}#floatBtns button{padding:8px 11px;font-size:12px;}.caption,.media,.choices{width:100%;}}"
  ].join("\n");

  var PLAYER_SKELETON = [
    '<div id="stage">',
    '  <div id="adRow" class="ad-row">',
    '    <a class="ad-banner" data-ad="0" target="_blank" rel="noopener noreferrer"></a>',
    '    <a class="ad-banner" data-ad="1" target="_blank" rel="noopener noreferrer"></a>',
    '  </div>',
    '  <div id="center">',
    '    <div id="media" class="media">',
    '      <div id="mediaBox" class="media-box"></div>',
    '      <div id="chars" class="chars"></div>',
    '      <div id="hud" class="hud"></div>',
    '      <div id="caption" class="caption">',
    '        <div id="speaker" class="speaker"></div>',
    '        <div id="text" class="text"></div>',
    '      </div>',
    '    </div>',
    '    <div class="dock">',
    '      <div id="audioBar" class="audio hidden">',
    '        <button id="audToggle" class="aud-btn">&#9654; 播放旁白</button>',
    '        <button id="audReplay" class="aud-btn">&#8635; 重听</button>',
    '        <span class="aud-label">&#128266; 该场景配有旁白</span>',
    '      </div>',
    '      <div id="vidCtl" class="vid-ctl hidden"><button id="vidReplay" class="vid-replay">&#8635; 重播视频</button></div>',
    '      <div id="choices" class="choices"></div>',
    '    </div>',
    '    <audio id="aud" preload="auto"></audio>',
    '  </div>',
    '</div>',
    '<div id="floatbar">',
    '  <div id="floatBtns">',
    '    <button id="btnBack">&larr; 返回</button>',
    '    <button id="btnRestart">&#8635; 重玩</button>',
    '    <button id="btnExit">&#10005; 结束</button>',
    '  </div>',
    '</div>',
    '<div id="ending" class="ending hidden">',
    '  <div class="end-card">',
    '    <div class="end-emoji">&#127916;</div>',
    '    <div class="end-title">—— 剧终 ——</div>',
    '    <div class="end-sub" id="endSub"></div>',
    '    <button id="endRestart" class="big-btn">&#8635; 重新开始</button>',
    '  </div>',
    '</div>'
  ].join("\n");

  // Self-contained runtime embedded into the exported file. Uses only globals
  // (window.STORY) so it carries no editor code. Written as a real function so
  // template literals / DOM calls stay intact through toString().
  function playerBootstrap() {
    "use strict";
    var story = window.STORY;
    function getVar(id){ for(var i=0;i<story.variables.length;i++) if(story.variables[i].id===id) return story.variables[i]; return null; }
    function getScene(id){ for(var i=0;i<story.scenes.length;i++) if(story.scenes[i].id===id) return story.scenes[i]; return null; }
    function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    function coerce(v,t){ if(t==="number") return Number(v)||0; if(t==="bool") return (v===true||v==="true"); return String(v==null?"":v); }

    var state = {};
    var stack = [];
    function initState(){ state={}; (story.variables||[]).forEach(function(v){ state[v.id]=coerce(v.init,v.type); }); renderState(); }
    function applyEffects(ch){ if(!ch.effects) return; ch.effects.forEach(function(ef){ var v=getVar(ef.varId); if(!v) return; var cur=state[ef.varId]; if(ef.op==="set") state[ef.varId]=coerce(ef.value,v.type); else if(ef.op==="add") state[ef.varId]=(Number(cur)||0)+(Number(ef.value)||0); else if(ef.op==="sub") state[ef.varId]=(Number(cur)||0)-(Number(ef.value)||0); else if(ef.op==="toggle") state[ef.varId]=!cur; }); renderState(); }
    function condMet(c){ if(!c||!c.varId) return true; var v=getVar(c.varId); if(!v) return true; var cur=state[c.varId], cmp=c.cmp||"==", val=c.value; if(cmp==="truthy") return !!cur; if(v.type==="number"){ var a=Number(cur)||0,b=Number(val)||0; if(cmp==="==")return a===b; if(cmp==="!=")return a!==b; if(cmp===">")return a>b; if(cmp===">=")return a>=b; if(cmp==="<")return a<b; if(cmp==="<=")return a<=b; return true; } if(v.type==="bool"){ var bv=(val===true||val==="true"); if(cmp==="==")return !!cur===bv; if(cmp==="!=")return !!cur!==bv; return !!cur; } var s=String(cur==null?"":cur),t=String(val==null?"":val); if(cmp==="==")return s===t; if(cmp==="!=")return s!==t; if(cmp===">")return s>t; if(cmp==="<")return s<t; return true; }
    function renderState(){ var el=document.getElementById("hud"); var vars=story.variables||[]; if(!vars.length){ el.style.display="none"; el.innerHTML=""; return; } el.style.display="flex"; var h=""; for(var i=0;i<vars.length;i++){ var v=vars[i],val=state[v.id]; var disp=v.type==="bool"?(val?"开":"关"):(val==null?"":String(val)); h+='<span class="chip"><span class="ck">'+esc(v.name)+'</span><span class="cv">'+esc(disp)+'</span></span>'; } el.innerHTML=h; }

    var mediaEl=document.getElementById("mediaBox"), speakerEl=document.getElementById("speaker"), textEl=document.getElementById("text"), choicesEl=document.getElementById("choices");
    var audioEl=document.getElementById("aud"), audioBar=document.getElementById("audioBar"), audToggle=document.getElementById("audToggle"), audReplay=document.getElementById("audReplay");
    var vidCtl=document.getElementById("vidCtl"), vidReplay=document.getElementById("vidReplay");
    function showScene(id){
      var sc=getScene(id); if(!sc) return;
      if(sc.media && sc.media.type!=="none" && sc.media.src){
        if(sc.media.type==="image") mediaEl.innerHTML='<img src="'+esc(sc.media.src)+'" alt="">';
        else if(sc.media.type==="video") mediaEl.innerHTML='<video src="'+esc(sc.media.src)+'" autoplay playsinline></video>';
        if(sc.media.type==="video"){ var v=mediaEl.querySelector("video"); if(v && vidCtl){ vidCtl.classList.remove("hidden"); vidReplay.style.display="none"; v.addEventListener("ended",function(){ vidReplay.style.display=""; }); vidReplay.onclick=function(){ v.currentTime=0; v.play().catch(function(){}); vidReplay.style.display="none"; }; } }
        else if(vidCtl){ vidCtl.classList.add("hidden"); }
      } else { mediaEl.innerHTML='<div class="ph">（无媒体）</div>'; if(vidCtl) vidCtl.classList.add("hidden"); }
      var charsEl=document.getElementById("chars");
      if(charsEl){ var chs=(sc.characters||[]), chh=""; for(var ci=0;ci<chs.length;ci++){ var cc=chs[ci]; chh+='<img class="char" src="'+esc(cc.src)+'" alt="" style="left:'+(cc.x!=null?cc.x:50)+'%;height:'+((cc.scale||0.5)*100)+'%">'; } charsEl.innerHTML=chh; }
      speakerEl.textContent=sc.speaker||""; speakerEl.style.display=sc.speaker?"block":"none";
      textEl.textContent=sc.text||"";
      choicesEl.innerHTML="";
      var active=sc.choices.filter(function(c){ return c.target && condMet(c.cond); });
      if(active.length===0){
        var end=document.createElement("div"); end.className="end";
        var had=sc.choices.some(function(c){return c.target;});
        end.textContent=had?"（当前条件不满足，剧情结束）":"—— 剧终 ——";
        choicesEl.appendChild(end);
      } else {
        active.forEach(function(ch){
          var b=document.createElement("button"); b.className="choice"; b.textContent=ch.label||"（继续）";
          b.addEventListener("click",function(){ stack.push(id); applyEffects(ch); showScene(ch.target); });
          choicesEl.appendChild(b);
        });
      }
      // audio narration
      if(sc.audio && sc.audio.src){
        audioBar.classList.remove("hidden");
        audioEl.pause(); audioEl.src=sc.audio.src;
        function upd(){ audToggle.innerHTML = audioEl.paused ? "&#9654; 播放旁白" : "&#10073;&#10073; 暂停"; }
        audToggle.onclick=function(){ if(audioEl.paused){ audioEl.play().catch(function(){}); } else { audioEl.pause(); } upd(); };
        audReplay.onclick=function(){ audioEl.currentTime=0; audioEl.play().catch(function(){}); upd(); };
        audioEl.onended=upd; audioEl.onplay=upd; audioEl.onpause=upd;
        if(sc.audio.autoplay!==false){ audioEl.play().then(upd).catch(upd); } else { upd(); }
      } else {
        audioEl.pause(); audioBar.classList.add("hidden");
      }
    }
    function showEnding(){ audioEl.pause(); var e=document.getElementById("ending"); if(e){ document.getElementById("endSub").textContent="感谢游玩《"+(story.name||"互动影游")+"》"; e.classList.remove("hidden"); } }
    function hideEnding(){ var e=document.getElementById("ending"); if(e) e.classList.add("hidden"); }

    var titleEl=document.getElementById("title"); if(titleEl) titleEl.textContent=story.name||"互动影游";
    var ads=story.ads||[], adBanners=document.querySelectorAll("#adRow .ad-banner");
    for(var ai=0;ai<adBanners.length;ai++){ var ax=ads[ai]; var b=adBanners[ai];
      if(ax && ax.url){ b.href=ax.url; b.target="_blank"; b.rel="noopener noreferrer"; b.classList.add("show");
        if(ax.src){ b.innerHTML='<img src="'+esc(ax.src)+'" alt="" onerror="this.style.display=\'none\'"><span class="ad-fallback">'+esc(ax.url)+'</span>'; }
        else { b.innerHTML='<span class="ad-fallback">广告位</span>'; }
      }
    }
    document.getElementById("btnBack").addEventListener("click",function(){ if(stack.length) showScene(stack.pop()); });
    document.getElementById("btnRestart").addEventListener("click",function(){ hideEnding(); stack=[]; initState(); showScene(story.start); });
    document.getElementById("btnExit").addEventListener("click",showEnding);
    document.getElementById("endRestart").addEventListener("click",function(){ hideEnding(); stack=[]; initState(); showScene(story.start); });

    // Auto-hide the control bar: hidden by default for a clean view, revealed on
    // mouse move / touch, then fades out after a short idle period.
    var floatbar=document.getElementById("floatbar"), hideTimer=null;
    function revealControls(){ if(floatbar) floatbar.classList.add("show"); if(hideTimer) clearTimeout(hideTimer); hideTimer=setTimeout(function(){ if(floatbar) floatbar.classList.remove("show"); }, 2600); }
    document.addEventListener("mousemove", revealControls);
    document.addEventListener("touchstart", revealControls, { passive:true });
    document.addEventListener("keydown", revealControls);
    revealControls();

    // Safety net: if a browser still blocks the start-gesture autoplay, resume
    // the narration on the first interaction inside the stage.
    document.getElementById("stage").addEventListener("pointerdown",function(){ if(audioEl && audioEl.paused && audioEl.src && (getScene(stack[stack.length-1]||story.start)||{}).audio) audioEl.play().catch(function(){}); }, { once:true });

    initState();
    showScene(story.start);
  }

  function exportPlayer() {
    if (!project.start || !getScene(project.start)) { alert("请先设置起始场景（在属性面板勾选“设为起始场景”）。"); return; }
    var title = project.name || "互动影游";
    // \u003c keeps "</script>" from breaking the embedded data block.
    // Exported works intentionally carry NO ads: pass an empty ads array so
    // the player's banners stay hidden. (Ads still show in editor toolbar / 试玩.)
    var exportProject = Object.assign({}, project, { ads: [] });
    var json = JSON.stringify(exportProject).replace(/</g, "\\u003c");
    var html =
      "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
      "<title>" + esc(title) + " · 互动影游</title>\n" +
      "<style>\n" + PLAYER_CSS + "\n</style>\n</head>\n<body>\n" +
      PLAYER_SKELETON + "\n" +
      "<script>var STORY=" + json + ";</script>\n" +
      "<script>(" + playerBootstrap.toString() + ")();</script>\n" +
      "</body>\n</html>";
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = (project.name || "interactive-movie") + "-播放器.html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    flash("已导出单文件播放器");
  }
  function reindexSeq() {
    var max = 0, vmax = 0;
    for (var i = 0; i < project.scenes.length; i++) {
      var m = /(\d+)$/.exec(project.scenes[i].id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    if (project.variables) for (var k = 0; k < project.variables.length; k++) {
      var mv = /(\d+)$/.exec(project.variables[k].id);
      if (mv) vmax = Math.max(vmax, parseInt(mv[1], 10));
    }
    _seq = max; _vseq = vmax;
  }

  function normalizeProject(p) {
    p.variables = p.variables || [];
    p.scenes = p.scenes || [];
    for (var i = 0; i < p.scenes.length; i++) {
      var sc = p.scenes[i];
      if (!sc.choices) sc.choices = [];
      for (var j = 0; j < sc.choices.length; j++) {
        var c = sc.choices[j];
        if (!c.effects) c.effects = [];
        if (c.cond === undefined) c.cond = null;
        if (!c.media) c.media = { type: "none", src: "" };
      }
      if (!sc.audio) sc.audio = { src: "", autoplay: true };
      if (!sc.characters) sc.characters = [];
    }
    return p;
  }

  /* ============================================================
     HELPERS / INIT
     ============================================================ */
  function flash(msg) {
    miniStatus.textContent = msg;
    setTimeout(updateStatus, 1200);
  }

  function init() {
    load(function () {
      // editor opens at default 100% (view.zoom stays 1, no auto-fit)
      applyWorld();
      // initial selection = start scene
      if (project.start) selectScene(project.start);
    });
  }
  init();
})();
