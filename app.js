import { checkFile, extensionOf, MEDIA_EXTENSIONS } from "./check.js";

const $ = (id) => document.getElementById(id);

function readerFor(file) {
  return async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}

function pathOf(file) {
  return file.webkitRelativePath || file.name;
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Windows batch file that renames the wrong-extension files. Paths are relative to the chosen folder.
function renameScript(rows) {
  const lines = ["@echo off", "cd /d \"%~dp0\"", "echo Renaming files to match what they really are..."];
  for (const r of rows) {
    const rel = r.path.split("/").slice(1).join("\\") || r.path;
    const dir = rel.includes("\\") ? rel.slice(0, rel.lastIndexOf("\\") + 1) : "";
    const target = dir + r.fixedName;
    lines.push(`if not exist "${target}" ren "${rel}" "${r.fixedName}"`);
  }
  lines.push("echo Done.", "pause");
  return lines.join("\r\n");
}

function csv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["file,status,really,problem", ...rows.map((r) => [r.path, r.status, r.type, r.problem].map(q).join(","))].join("\n");
}

function table(rows, withFix) {
  return `<table><tr><th>File</th><th>What's wrong</th>${withFix ? "<th>Should be</th>" : ""}</tr>${rows
    .map((r) => `<tr><td>${esc(r.path)}</td><td>${esc(r.problem)}</td>${withFix ? `<td>${esc(r.fixedName)}</td>` : ""}</tr>`)
    .join("")}</table>`;
}

async function run(fileList) {
  const files = [...fileList].filter((f) => MEDIA_EXTENSIONS.includes(extensionOf(f.name)) || extensionOf(f.name) === "");
  const rows = [];
  $("verdict").className = "";
  $("results").innerHTML = "";
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (i % 25 === 0) $("progress").textContent = `Checking ${i + 1} of ${files.length}...`;
    try {
      rows.push({ path: pathOf(f), ...(await checkFile(f.name, f.size, readerFor(f))) });
    } catch (error) {
      rows.push({ path: pathOf(f), status: "unknown", problem: `could not read: ${error.message}` });
    }
  }
  $("progress").textContent = `Checked ${files.length} photos and videos.`;
  show(rows);
}

function show(rows) {
  const broken = rows.filter((r) => r.status === "broken");
  const renamed = rows.filter((r) => r.status === "renamed");
  const unknown = rows.filter((r) => r.status === "unknown");
  const ok = rows.filter((r) => r.status === "ok");

  const verdict = $("verdict");
  if (rows.length === 0) {
    verdict.className = "bad";
    verdict.textContent = "No photos or videos found in what you picked.";
    return;
  }
  if (broken.length === 0) {
    verdict.className = "ok";
    verdict.textContent = renamed.length
      ? `All ${rows.length} files copied whole. Safe to delete from your phone. ${renamed.length} just need renaming (see below).`
      : `All ${rows.length} files copied whole. Safe to delete from your phone.`;
  } else {
    verdict.className = "bad";
    verdict.textContent = `Don't delete from your phone yet. ${broken.length} of ${rows.length} files did not copy completely. Copy those again.`;
  }

  let html = `<p>${ok.length} fine · ${renamed.length} wrong extension · ${broken.length} cut short or empty${unknown.length ? ` · ${unknown.length} not recognised` : ""}</p>`;
  if (broken.length) {
    html += `<details open><summary>${broken.length} files to copy again</summary>
      <p class="muted">These are missing data. Copy them from the phone again (with Keep Originals on), then check again.</p>${table(broken)}</details>`;
  }
  if (renamed.length) {
    html += `<details${broken.length ? "" : " open"}><summary>${renamed.length} files with the wrong extension</summary>
      <p class="muted">Nothing is missing, the name is just wrong, so Windows opens them with the wrong app.
      Download the rename script, put it in the folder you chose, and double-click it.</p>
      <button id="fix">Download rename script (Windows)</button>${table(renamed, true)}</details>`;
  }
  if (unknown.length) {
    html += `<details><summary>${unknown.length} files not recognised</summary>${table(unknown)}</details>`;
  }
  html += `<button id="report">Download full report (CSV)</button>`;
  $("results").innerHTML = html;

  $("report").onclick = () => download("photo-check-report.csv", csv(rows), "text/csv");
  if (renamed.length) $("fix").onclick = () => download("fix-extensions.bat", renameScript(renamed));
}

$("folder").addEventListener("change", (e) => run(e.target.files));
$("files").addEventListener("change", (e) => run(e.target.files));
