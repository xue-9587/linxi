/* ============================================================
   gen_player_assets.js
   Single source of truth for the interactive-movie PLAYER.
   Reads the three player pieces out of app.js (the original
   vanilla editor) and emits TWO byte-compatible builders:
     - php/player_runtime.js   : client-side window.PLAYER_BUILDER.buildPlayerHtml()
     - php/player_template.php : server-side build_player_html()
   Both produce an identical self-contained HTML player, so the
   exported file is the same whether built in the browser (file://)
   or on the PHP server (HTTP).
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "app.js");
const OUT_RT = path.join(ROOT, "php", "player_runtime.js");
const OUT_TPL = path.join(ROOT, "php", "player_template.php");

const src = fs.readFileSync(APP, "utf8");

/* ---------- 1. PLAYER_CSS array literal ---------- */
const cssM = src.match(/var PLAYER_CSS = (\[[\s\S]*?\])\.join\("\\n"\);/);
if (!cssM) throw new Error("PLAYER_CSS not found");
const cssLiteral = cssM[1];
const cssArray = (0, eval)(cssLiteral);
const CSS = cssArray.join("\n");

/* ---------- 2. PLAYER_SKELETON array literal ---------- */
const skelM = src.match(/var PLAYER_SKELETON = (\[[\s\S]*?\])\.join\("\\n"\);/);
if (!skelM) throw new Error("PLAYER_SKELETON not found");
const skelLiteral = skelM[1];
const skelArray = (0, eval)(skelLiteral);
const SKELETON = skelArray.join("\n");

/* ---------- 3. playerBootstrap() function source ---------- */
const startIdx = src.indexOf("function playerBootstrap()");
const endIdx = src.indexOf("function exportPlayer()");
if (startIdx < 0 || endIdx < 0) throw new Error("playerBootstrap not found");
let bootstrapSrc = src.slice(startIdx, endIdx).trim();
if (bootstrapSrc.endsWith(";")) bootstrapSrc = bootstrapSrc.slice(0, -1);

/* ============================================================
   Emit php/player_runtime.js  (client-side builder)
   ============================================================ */
const rt =
`/* AUTO-GENERATED from app.js by build/gen_player_assets.js — do not edit by hand. */
(function () {
  "use strict";

  var PLAYER_CSS = (${cssLiteral}).join("\\n");
  var PLAYER_SKELETON = (${skelLiteral}).join("\\n");
  var PLAYER_BOOTSTRAP = ${bootstrapSrc};

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function _getScene(p, id) {
    if (!p.scenes) return null;
    for (var i = 0; i < p.scenes.length; i++) if (p.scenes[i].id === id) return p.scenes[i];
    return null;
  }

  /* Build a standalone, double-clickable HTML player.
     Returns "" (and shows an alert) when no start scene is set. */
  window.PLAYER_BUILDER = {
    buildPlayerHtml: function (project) {
      if (!project.start || !_getScene(project, project.start)) {
        alert("请先设置起始场景（在属性面板勾选“设为起始场景”）。");
        return "";
      }
      var title = project.name || "互动影游";
      // Exported works intentionally carry NO ads: ads:[] keeps banners hidden.
      var exportProject = Object.assign({}, project, { ads: [] });
      var json = JSON.stringify(exportProject).replace(/</g, "\\\\u003c");
      return "<!DOCTYPE html>\\n<html lang=\\"zh-CN\\">\\n<head>\\n<meta charset=\\"UTF-8\\">\\n" +
        "<meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\">\\n" +
        "<title>" + _esc(title) + " · 互动影游</title>\\n" +
        "<style>\\n" + PLAYER_CSS + "\\n</style>\\n</head>\\n<body>\\n" +
        PLAYER_SKELETON + "\\n" +
        "<script>var STORY=" + json + ";</script>\\n" +
        "<script>(" + PLAYER_BOOTSTRAP.toString() + ")();</script>\\n" +
        "</body>\\n</html>";
    }
  };
})();
`;

/* ============================================================
   Emit php/player_template.php  (server-side builder)
   No trailing ?> so nothing is output before api.php's headers.
   ============================================================ */
const tpl =
`<?php
/* AUTO-GENERATED from app.js by build/gen_player_assets.js — do not edit by hand. */
if (!function_exists('build_player_html')) {

  define('PLAYER_CSS', <<<'PLAYER_CSS_EOF'
${CSS}
PLAYER_CSS_EOF
  );

  define('PLAYER_SKELETON', <<<'PLAYER_SKELETON_EOF'
${SKELETON}
PLAYER_SKELETON_EOF
  );

  define('PLAYER_BOOTSTRAP_SRC', <<<'PLAYER_BOOTSTRAP_EOF'
${bootstrapSrc}
PLAYER_BOOTSTRAP_EOF
  );

  function _pb_get_scene($p, $id) {
    if (empty($p['scenes'])) return null;
    foreach ($p['scenes'] as $sc) { if ($sc['id'] === $id) return $sc; }
    return null;
  }

  /* Build a standalone, double-clickable HTML player.
     Returns '' when no start scene is set (caller should guard). */
  function build_player_html($project) {
    if (empty($project['start']) || !_pb_get_scene($project, $project['start'])) {
      return '';
    }
    $title = isset($project['name']) ? $project['name'] : '互动影游';
    // Exported works intentionally carry NO ads: ads:[] keeps banners hidden.
    $export = array_merge($project, array('ads' => array()));
    $json = str_replace('<', '\\\\u003c', json_encode($export, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return "<!DOCTYPE html>\\n<html lang=\\"zh-CN\\">\\n<head>\\n<meta charset=\\"UTF-8\\">\\n"
      . "<meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\">\\n"
      . "<title>" . htmlspecialchars($title, ENT_COMPAT, 'UTF-8') . " · 互动影游</title>\\n"
      . "<style>\\n" . PLAYER_CSS . "\\n</style>\\n</head>\\n<body>\\n"
      . PLAYER_SKELETON . "\\n"
      . "<script>var STORY=" . $json . ";</script>\\n"
      . "<script>(" . PLAYER_BOOTSTRAP_SRC . ")();</script>\\n"
      . "</body>\\n</html>";
  }
}
`;

fs.writeFileSync(OUT_RT, rt, "utf8");
fs.writeFileSync(OUT_TPL, tpl, "utf8");

console.log("Wrote", OUT_RT, "(" + rt.length + " bytes)");
console.log("Wrote", OUT_TPL, "(" + tpl.length + " bytes)");
console.log("CSS lines:", cssArray.length, "SKELETON lines:", skelArray.length, "bootstrap bytes:", bootstrapSrc.length);
