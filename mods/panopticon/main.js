import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  agents, appHome, checking, closeOverlay, focused, keys, layout, layouts, nextCommand, notify, panes,
  props, readTextFile, run, setShared, shared, spaces, terminals, theme, writeTextFile,
} from "herdr";

// One entry file: Herdr confines relative imports to the mod directory, including through Stow links.
const NAME = "panopticon";
const ROOT = "panopticon-agent-grid";
const RETURN_TO = "panopticon.returnLayout";
const FOCUS_ADDRESS = "panopticon.focusAddress";
export const GRID_LAYOUT_VERSION = 1;
const statusLabel = { working: "Working", blocked: "Needs you", error: "Needs you", done: "Done", idle: "Idle" };

// Single source for the native mark and branding/build.py. Keep the object valid JSON.
export const BRAND_GEOMETRY = Object.freeze({
  "size": 256,
  "center": 128,
  "cells": 8,
  "outer": 106,
  "inner": 73,
  "gap": 7,
  "panes": [99, 132],
  "paneSize": 25,
  "paneRadius": 5
});
Object.freeze(BRAND_GEOMETRY.panes);

let nativeBrandPaths;
function brandPaths() {
  if (nativeBrandPaths) return nativeBrandPaths;
  const g = BRAND_GEOMETRY, percent = value => `${value / g.size * 100}%`;
  const point = (radius, angle) => {
    const a = angle * Math.PI / 180;
    return [percent(g.center + radius * Math.cos(a)), percent(g.center + radius * Math.sin(a))];
  };
  const cells = PathBuilder.fill(), panes = PathBuilder.fill();
  const step = 360 / g.cells;
  for (let i = 0; i < g.cells; i++) {
    const start = -90 + i * step + g.gap / 2, end = -90 + (i + 1) * step - g.gap / 2;
    cells.move_to(...point(g.outer, start))
      .arc_to(percent(g.outer), percent(g.outer), 0, false, true, ...point(g.outer, end))
      .line_to(...point(g.inner, end))
      .arc_to(percent(g.inner), percent(g.inner), 0, false, false, ...point(g.inner, start)).close();
  }
  const r = g.paneRadius, s = g.paneSize, radius = percent(r);
  for (const y of g.panes) for (const x of g.panes) {
    panes.move_to(percent(x + r), percent(y)).line_to(percent(x + s - r), percent(y))
      .arc_to(radius, radius, 0, false, true, percent(x + s), percent(y + r))
      .line_to(percent(x + s), percent(y + s - r))
      .arc_to(radius, radius, 0, false, true, percent(x + s - r), percent(y + s))
      .line_to(percent(x + r), percent(y + s))
      .arc_to(radius, radius, 0, false, true, percent(x), percent(y + s - r))
      .line_to(percent(x), percent(y + r))
      .arc_to(radius, radius, 0, false, true, percent(x + r), percent(y)).close();
  }
  // Immutable, percentage-based paths work at both sizes and survive theme changes.
  nativeBrandPaths = { cells: cells.build(), panes: panes.build() };
  return nativeBrandPaths;
}

export function brandMark(size, t) {
  const paths = brandPaths();
  const layer = (path, color) => window.paint_path(path, color)
    .absolute().top(0).left(0).size_full();
  return div().relative().size(size).flex_none()
    .child(layer(paths.cells, t.foreground))
    .child(layer(paths.panes, t.accent || t.foreground));
}

// Anchor ownership in ALL tabs' panes. Follow live descendants, even through non-agent workers,
// but don't adopt unrelated core terminals. A child with a pane belongs to its own tab.
export function gridSessions(allSpaces, allPanes, allAgents, allTerminals) {
  const tabs = new Set(allSpaces.flatMap(s => s.tabs.map(t => t.id)));
  const reported = new Set(allAgents.map(a => a.address));
  const core = new Map(allTerminals.map(t => [t.address, t]));
  const attached = new Set(allPanes.map(p => p.terminal));
  const children = new Map();
  for (const t of allTerminals) {
    if (!t.parent || t.state !== "live" || attached.has(t.address)) continue;
    if (!children.has(t.parent)) children.set(t.parent, []);
    children.get(t.parent).push(t.address);
  }
  const result = [], seen = new Set();
  function visit(address, tab, pane) {
    const t = core.get(address);
    if (seen.has(address) || (t && t.state !== "live")) return;
    seen.add(address);
    if (reported.has(address) || pane?.program?.agent || pane?.status || t?.program?.agent || t?.report?.app || t?.agent) {
      result.push({ address, tab });
    }
    for (const child of children.get(address) ?? []) visit(child, tab, null);
  }
  for (const p of allPanes) if (p.terminal && tabs.has(p.tab)) visit(p.terminal, p.tab, p);
  return result;
}
const sessions = () => gridSessions(spaces(), panes(), agents(), terminals());

export function gridSelectedAddress(items, preferredAddress = null, rememberedAddress = null) {
  if (!Array.isArray(items) || !items.length) return null;
  if (preferredAddress && items.some(item => item.address === preferredAddress)) return preferredAddress;
  if (rememberedAddress && items.some(item => item.address === rememberedAddress)) return rememberedAddress;
  return items[0].address;
}

export function gridSessionDestination(items, allPanes, allAgents, address) {
  if (!address || !Array.isArray(items)) return null;
  const item = items.find(item => item.address === address);
  if (!item) return null;
  const agent = allAgents?.find(a => a.address === address);
  const pane = allPanes?.find(p => p.terminal === address);
  const originalPane = agent?.pane || pane?.pane || null;
  if (originalPane) return { pane: originalPane };
  return item.tab ? { tab: item.tab, terminal: address } : null;
}

const sameSessions = (a, b) => Array.isArray(a) && a.length === b.length &&
  a.every((s, i) => s.address === b[i].address && s.tab === b[i].tab);

const block = (id, content, extra = {}) => ({ id, type: "block", content, ...extra });
const panel = (role, data = {}) => ({ mod: NAME, props: { role, ...data } });

// These are native terminal blocks, not excerpts read from scrollback. No active-space/tab block.
export function gridLayout(items) {
  const children = [block("panopticon-bar", panel("bar", { items, version: GRID_LAYOUT_VERSION }), { size: { px: 34 } })];
  const columns = Math.ceil(Math.sqrt(items.length));
  for (let i = 0; i < items.length; i += columns) {
    const cells = items.slice(i, i + columns).map(item => {
      const id = `agent-${encodeURIComponent(item.address)}`;
      return { id, type: "column", resizable: false,
        border: { width: 1, color: "border" },
        focus: { border: { width: 2, color: "accent" } }, children: [
        block(`${id}-caption`, panel("caption", item), { size: { px: 26 } }),
        block(`${id}-terminal`, { terminal: item.address }),
      ] };
    });
    // Keep the last row on the same column boundaries as the others.
    if (cells.length < columns) cells.push(block("panopticon-spacer", panel("spacer"), {
      size: { weight: columns - cells.length },
    }));
    children.push({ id: `row-${i}`, type: "row", resizable: false, gap: 4, children: cells });
  }
  if (!items.length) children.push(block("panopticon-empty", panel("empty")));
  return { id: ROOT, type: "column", resizable: false, padding: 4, gap: 4, font_size: 12, children };
}

export function gridNavigationAddress(items, direction, currentAddress = null) {
  if (!Array.isArray(items) || !items.length) return null;
  const index = items.findIndex(item => item.address === currentAddress);
  if (index < 0) {
    if (direction === "left" || direction === "up") return items[items.length - 1].address;
    if (direction === "right" || direction === "down") return items[0].address;
    return null;
  }
  const columns = Math.ceil(Math.sqrt(items.length));
  const row = Math.floor(index / columns), column = index - row * columns;
  if (direction === "left" && column > 0) return items[index - 1].address;
  if (direction === "right" && column + 1 < columns && index + 1 < items.length) return items[index + 1].address;
  if (direction === "left" || direction === "right") {
    for (const targetRow of [row - 1, row + 1]) {
      if (targetRow < 0) continue;
      const start = targetRow * columns;
      if (start >= items.length) continue;
      const end = Math.min(start + columns, items.length);
      let nearest = null;
      for (let i = start; i < end; i++) {
        const targetColumn = i - start;
        if (direction === "left" && targetColumn < column &&
          (!nearest || targetColumn > nearest.targetColumn)) nearest = { i, targetColumn };
        if (direction === "right" && targetColumn > column &&
          (!nearest || targetColumn < nearest.targetColumn)) nearest = { i, targetColumn };
      }
      if (nearest) return items[nearest.i].address;
      const clampedColumn = Math.min(column, end - start - 1);
      return items[start + clampedColumn].address;
    }
  }
  if (direction === "up") return row > 0 ? items[index - columns].address : null;
  if (direction === "down") {
    const target = row * columns + column + columns;
    return target < items.length ? items[target].address : null;
  }
  return null;
}

export function gridNavigationCommand(command) {
  const direction = ["navigate:", "panopticon."].reduce((value, prefix) =>
    value?.startsWith(prefix) ? value.slice(prefix.length) : value, command);
  return ["left", "right", "up", "down"].includes(direction) ? direction : null;
}

const GRID_NAVIGATION_KEYS = new Map([
  ["alt-left", "left"], ["alt-right", "right"], ["alt-up", "up"], ["alt-down", "down"],
  ["alt-h", "left"], ["alt-l", "right"], ["alt-k", "up"], ["alt-j", "down"],
]);
let gridNavigationOriginals = null;
function installGridNavigation(cx) {
  if (gridNavigationOriginals) {
    cx.bind_keys([...gridNavigationOriginals].map(({ keystroke, direction }) =>
      ({ keystroke, action: `panopticon.${direction}` })));
    return;
  }
  gridNavigationOriginals = keys().filter(k => k.section === "global" && GRID_NAVIGATION_KEYS.has(k.keys))
    .map(k => ({ keystroke: k.keys, action: k.action, direction: GRID_NAVIGATION_KEYS.get(k.keys) }));
  cx.bind_keys(gridNavigationOriginals.map(({ keystroke, direction }) =>
    ({ keystroke, action: `panopticon.${direction}` })));
}
function restoreGridNavigation(cx) {
  if (!gridNavigationOriginals) return;
  cx.bind_keys(gridNavigationOriginals.map(({ keystroke, action }) => ({ keystroke, action })));
  gridNavigationOriginals = null;
}

const owned = tree => tree?.id === ROOT && tree.children?.[0]?.content?.mod === NAME &&
  tree.children[0].content.props?.role === "bar";
function previousLayout() {
  const name = shared(RETURN_TO);
  return name !== NAME && layouts().includes(name) ? name : "main";
}
function focusGridSession(address) {
  const destination = gridSessionDestination(sessions(), panes(), agents(), address);
  if (!destination) return;
  if (destination.pane) run("pane.focus", { pane: destination.pane });
  else {
    run("tab.select", { id: destination.tab });
    run("terminal.peek", { terminal: destination.terminal });
  }
}

const back = (cx, address = null) => {
  if (cx) restoreGridNavigation(cx);
  const items = sessions();
  const remembered = shared(FOCUS_ADDRESS);
  const selected = gridSelectedAddress(items, address || remembered || null, focused()?.terminal);
  if (selected) setShared(FOCUS_ADDRESS, selected);
  run("layout.switch", { name: previousLayout() });
  if (selected) focusGridSession(selected);
};

async function toggle(overlay, cx) {
  const from = shared("layout") || "main";
  if (from === NAME && owned(layout())) { closeOverlay(overlay); back(cx); return; }
  try {
    // Machine/session IDs are ephemeral. Create only our private runtime layout, never a Stow
    // link or a clone of the user's layout. Compare-and-swap protects concurrent file edits.
    const path = `${appHome()}/layouts/${NAME}.json`;
    const raw = await readTextFile(path);
    const existing = raw === null ? null : JSON.parse(raw);
    if (raw !== null && !owned(existing)) throw new Error(`Leaving the existing ${path} untouched.`);
    const items = sessions();
    const savedProps = existing?.children?.[0]?.content?.props;
    if (!existing || savedProps.version !== GRID_LAYOUT_VERSION || !sameSessions(savedProps.items, items)) {
      await writeTextFile(path, JSON.stringify(gridLayout(items), null, 2) + "\n", raw);
    }
    // The app discovers new layout files asynchronously on first use.
    for (let i = 0; i < 30 && !layouts().includes(NAME); i++) await cx.sleep(100);
    if (!layouts().includes(NAME)) throw new Error("Herdr hasn't discovered the grid layout yet. Try again.");
    if ((shared("layout") || "main") !== from) { closeOverlay(overlay); return; }
    setShared(RETURN_TO, from);
    // From a regular layout, the currently focused agent is the strongest signal.  The
    // remembered address is only the fallback when that session is not part of the grid.
    const selected = gridSelectedAddress(items, focused()?.terminal || null, shared(FOCUS_ADDRESS));
    if (selected) setShared(FOCUS_ADDRESS, selected);
    closeOverlay(overlay);
    run("layout.switch", { name: NAME });
    if (selected) run("pane.focus", { terminal: selected });
  } catch (error) {
    closeOverlay(overlay);
    notify({ title: "Couldn't open Panopticon", body: String(error), level: "error" });
  }
}

// Herdr's default tab naming, applied to each tile's terminal. Keep this mod self-contained:
// custom names stay; unnamed/program-named agents follow a meaningful, cleaned live title.
function sessionName(tab, program, title, address) {
  const prog = program.name;
  const named = tab.named ?? Boolean(tab.name && !/^\d+$/.test(tab.name));
  const base = named ? tab.name : prog;
  if (!program.agent) return base;
  const live = (title ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();
  // Inspect the raw title too: cleaning strips a path's leading ~ or /.
  const path = /^[~/]|^[A-Za-z]:\\/.test((title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== address && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== program.key;
  return (!named || tab.name === prog) && telling ? live : base;
}

// Presentation only: keep the source names, addresses, ownership and ordering intact.
export function sessionCaptions(items, allSpaces, allPanes, allAgents, allTerminals, focusedAddress = null) {
  const index = (entries, key) => {
    const result = new Map();
    for (const entry of entries) if (entry[key] && !result.has(entry[key])) result.set(entry[key], entry);
    return result;
  };
  const agentByAddress = index(allAgents, "address"), paneByAddress = index(allPanes, "terminal");
  const terminalByAddress = index(allTerminals, "address"), locations = new Map();
  for (const space of allSpaces) for (const tab of space.tabs) {
    if (!locations.has(tab.id)) locations.set(tab.id, { space, tab });
  }
  const counts = new Map();
  const captions = items.map(({ address, tab }) => {
    const a = agentByAddress.get(address), p = paneByAddress.get(address), term = terminalByAddress.get(address);
    const owner = locations.get(tab);
    const spaceName = owner?.space.name || a?.space_name || "";
    const tabName = owner?.tab.name || a?.tab_name || "";
    const programInfo = a?.program || p?.program || term?.program;
    const icon = programInfo?.icon || null, tint = Boolean(programInfo?.tint);
    const program = a?.program?.name || p?.program?.name || term?.program?.name || term?.name || "Agent";
    const title = a?.title || p?.title || term?.title || term?.name || program;
    const name = sessionName({ name: tabName, named: owner?.tab.named }, { ...programInfo, name: program }, title, address);
    const status = a?.status || p?.status || term?.status;
    const pane = a?.pane || p?.pane || null, helper = !pane;
    const detail = [spaceName, helper ? `${program} helper` : name === program ? "" : program]
      .filter(Boolean).join(" · ");
    const context = [program, [spaceName, name].filter(Boolean).join(" / "), address].join(" · ");
    const destination = pane ? "Go to original pane" : "Peek at agent";
    const focused = address === focusedAddress;
    const tooltip = `${context}\n${title} — ${destination}${focused ? "\nCurrently focused" : ""}`;
    // Disambiguate visible labels, never using status to name or reorder sessions.
    const key = JSON.stringify([name, spaceName, program, helper]);
    counts.set(key, (counts.get(key) || 0) + 1);
    return { address, tab, name, detail, icon, tint, status, pane, tooltip, key, focused };
  });
  return captions.map(({ key, ...caption }) => ({
    ...caption, id: counts.get(key) > 1 ? caption.address : null,
  }));
}

export function captionRow(c, t) {
  return h_flex().id(`caption-${c.address}`).size_full().px(7).gap(6).items_center().bg(c.focused ? t.selected : t.chrome)
    .text_size(12).cursor_pointer().hover(el => el.bg(t.hover)).tooltip(c.tooltip)
    .on_click((_e, cx) => {
      setShared(FOCUS_ADDRESS, c.address);
      back(cx, c.address);
    })
    .when(Boolean(c.focused), el => el.child(div().id(`focused-${c.address}`).flex_none().size(7).rounded(7).bg(t.accent).tooltip("Currently focused")))
    // Match regular pane headers: tint monochrome SVGs, preserve full-color image icons.
    .when(Boolean(c.icon), el => el.child(c.tint
      ? svg(c.icon).size(14).flex_none().text_color(t.dim)
      : image(c.icon).w(14).h(14).flex_none()))
    .child(h_flex().flex_1().min_w(0).gap(6).items_center().overflow_hidden()
      .child(div().flex_none().max_w(c.detail ? "65%" : "100%").truncate().font_semibold().text_color(t.foreground).child(c.name))
      .when(Boolean(c.detail), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(c.detail))))
    .when(Boolean(c.id), el => el.child(div().flex_none().max_w("25%").truncate().text_size(11).text_color(t.dim).child(c.id)))
    .child(div().flex_none().text_color(t[c.status === "error" ? "blocked" : c.status] || t.dim)
      .child(statusLabel[c.status] || "Open"));
}

function caption(item, t) {
  const tree = layout(), saved = owned(tree) ? tree.children[0].content.props.items : null;
  const items = Array.isArray(saved) ? saved : [item];
  const snapshot = [spaces(), panes(), agents(), terminals()];
  const actualAddress = focused()?.terminal || null;
  const focusedAddress = gridSelectedAddress(items, shared(FOCUS_ADDRESS), actualAddress);
  const c = sessionCaptions(items, ...snapshot, focusedAddress).find(c => c.address === item.address)
    || sessionCaptions([item], ...snapshot, focusedAddress)[0];
  if (c.focused) setShared(FOCUS_ADDRESS, c.address);
  return captionRow(c, t);
}

export default class Panopticon extends View {
  async close(cx) {
    restoreGridNavigation(cx);
  }

  init(_props, cx) {
    const { overlay, role } = props() ?? {};
    this.handle = cx.focus_handle();
    if (overlay && !role && !checking()) cx.spawn(cx => toggle(overlay, cx));
    if (role === "bar" && !checking()) {
      installGridNavigation(cx);
      cx.spawn(async cx => {
        for (;;) {
          const command = await nextCommand();
          if (command === "focus") { this.handle.focus(); cx.notify(); continue; }
          const direction = gridNavigationCommand(command);
          if (!direction) continue;
          this.navigate(direction);
        }
      });
    }
  }

  navigate(direction) {
    if (shared("layout") !== NAME || !owned(layout())) {
      run("pane.go", { direction });
      return;
    }
    const items = sessions();
    const current = gridSelectedAddress(items, shared(FOCUS_ADDRESS), focused()?.terminal);
    const next = gridNavigationAddress(items, direction, current);
    if (next) {
      setShared(FOCUS_ADDRESS, next);
      run("pane.focus", { terminal: next });
    }
  }

  render() {
    const p = props() ?? {}, t = theme();
    if (p.role === "caption") return caption(p, t);
    if (p.role === "spacer") return div();
    if (p.role === "bar") {
      const items = sessions();
      // Only membership/location changes rebuild the grid. Output paints natively; title and
      // status changes update captions without moving tiles or resizing running terminals.
      if (!checking() && shared("layout") === NAME && owned(layout()) &&
        (p.version !== GRID_LAYOUT_VERSION || !sameSessions(p.items, items))) {
        const key = JSON.stringify(items);
        if (key !== this.pending) { this.pending = key; run("layout.set", { layout: gridLayout(items) }); }
      } else this.pending = null;
      return h_flex().id("panopticon-bar").track_focus(this.handle).size_full().px(8).gap(12).items_center().bg(t.chrome).text_size(13)
        .on_key_down((e, cx) => {
          if (!e.modifiers.alt) return;
          const direction = { left: "left", h: "left", right: "right", l: "right", up: "up", k: "up", down: "down", j: "down" }[e.key];
          if (!direction) return;
          this.navigate(direction);
          cx.stop_propagation();
        })
        .child(h_flex().flex_none().gap(6).items_center()
          .child(brandMark(24, t))
          .child(div().font_semibold().text_color(t.foreground).child("Panopticon")))
        .child(div().flex_1().text_color(t.muted).child(`All spaces · ${items.length} agent${items.length === 1 ? "" : "s"}`))
        .child(div().id("back").px(9).py(3).rounded(5).bg(t.surface).text_color(t.foreground)
          .cursor_pointer().hover(el => el.bg(t.hover)).on_click((_e, cx) => back(cx)).child(`Back to ${previousLayout()}  ·  Ctrl+Shift+G`));
    }
    return v_flex().size_full().items_center().justify_center().gap(12).text_color(t.muted)
      .when(p.role === "empty", el => el.child(brandMark(48, t)))
      .child(p.role === "empty" ? "No open agent sessions across your spaces." : "Switching layouts…");
  }
}
