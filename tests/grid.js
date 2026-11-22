import { View, div } from "gpui-kit";
import {
  BRAND_GEOMETRY, GRID_LAYOUT_VERSION, brandMark, captionRow, gridLayout, gridNavigationAddress,
  gridNavigationCommand, gridSelectedAddress, gridSessionDestination, gridSessions, sessionCaptions,
} from "./panopticon.js";

function equal(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const walk = node => [node, ...(node.children ?? []).flatMap(walk)];

export default class GridChecks extends View {
  render() {
    // Two spaces, only one selected; a settled tab still owns live agents.
    const spaces = [{ active: true, tabs: [{ id: "a" }] }, { tabs: [{ id: "box/a", settled: true }] }];
    const panes = [
      { tab: "a", terminal: "t1", program: { name: "bash" } },
      { tab: "a", terminal: "t2" }, { tab: "a", terminal: null, mod: "files" },
      { tab: "box/a", terminal: "box/t1", program: { agent: true } },
    ];
    const live = (address, extra) => ({ address, state: "live", ...extra });
    const core = [live("t1"), live("t2"), live("box/t1", { parent: "t2" }),
      live("worker", { parent: "box/t1" }), live("helper", { parent: "worker", report: { app: "pi" } }),
      live("unassigned", { agent: "pi" }), { address: "old", state: "exited", parent: "t1", agent: "pi" }];
    const sources = gridSessions(spaces, panes, [{ address: "t2", status: "idle" }], core);
    equal("only agents, in their owning tabs", sources, [
      { address: "t2", tab: "a" }, { address: "box/t1", tab: "box/a" }, { address: "helper", tab: "box/a" },
    ]);
    const tree = gridLayout(sources), nodes = walk(tree);
    equal("one live block per agent", nodes.flatMap(n => n.content?.terminal ? [n.content.terminal] : []),
      ["t2", "box/t1", "helper"]);
    equal("grid not attached to any tab", nodes.some(n => n.content?.tab), false);
    equal("three agents in a 2×2 grid", tree.children.slice(1).map(row => [row.type, row.children.length]),
      [["row", 2], ["row", 2]]);
    equal("no duplicate layout ids", new Set(nodes.map(n => n.id)).size, nodes.length);
    equal("space changes don't filter the grid", gridSessions(spaces.map(s => ({ ...s, active: !s.active })),
      panes, [{ address: "t2" }], core), sources);
    equal("empty state", gridLayout([]).children[1].content.props.role, "empty");
    equal("one full-size tile", gridLayout(sources.slice(0, 1)).children[1].children.length, 1);
    equal("branding keeps the 34 px toolbar", tree.children[0].size.px, 34);
    equal("grid layout version", tree.children[0].content.props.version, GRID_LAYOUT_VERSION);
    equal("tile focus border uses accent", nodes.filter(n => /^agent-.+/.test(n.id) && n.type === "column")
      .map(n => n.focus?.border), [
        { width: 2, color: "accent" }, { width: 2, color: "accent" }, { width: 2, color: "accent" },
      ]);

    const moving = [{ address: "a" }, { address: "b" }, { address: "c" }, { address: "d" }];
    equal("grid navigation right", gridNavigationAddress(moving, "right", "a"), "b");
    equal("grid navigation down", gridNavigationAddress(moving, "down", "a"), "c");
    equal("grid navigation left", gridNavigationAddress(moving, "left", "d"), "c");
    equal("grid navigation up", gridNavigationAddress(moving, "up", "d"), "b");
    equal("grid navigation falls back to adjacent lateral tiles", [
      gridNavigationAddress(moving, "right", "d"),
      gridNavigationAddress(moving, "left", "a"),
      gridNavigationAddress(moving, "right", "b"),
      gridNavigationAddress(moving, "left", "c"),
    ], ["b", "c", "d", "a"]);
    equal("grid navigation stops at vertical edges", [
      gridNavigationAddress(moving, "up", "a"),
      gridNavigationAddress(moving, "down", "d"),
    ], [null, null]);
    equal("grid navigation chooses an edge from no focus", [
      gridNavigationAddress(moving, "left", null),
      gridNavigationAddress(moving, "up", null),
      gridNavigationAddress(moving, "right", null),
      gridNavigationAddress(moving, "down", null),
    ], ["d", "d", "a", "a"]);
    const partial = [...moving, { address: "e" }];
    equal("grid navigation handles a partial last row", [
      gridNavigationAddress(partial, "right", "d"),
      gridNavigationAddress(partial, "down", "b"),
      gridNavigationAddress(partial, "right", "e"),
      gridNavigationAddress(partial, "left", "d"),
    ], ["e", "e", "c", "a"]);
    const incomplete = [{ address: "a" }, { address: "b" }, { address: "c" }];
    equal("grid navigation clamps to an incomplete adjacent row", [
      gridNavigationAddress(incomplete, "right", "b"),
      gridNavigationAddress(incomplete, "left", "c"),
    ], ["c", "a"]);
    equal("grid opening prefers the active regular session", [
      gridSelectedAddress(moving, "b", "d"),
      gridSelectedAddress(moving, "missing", "d"),
      gridSelectedAddress(moving, null, "missing"),
      gridSelectedAddress([], "b", "d"),
    ], ["b", "d", "a", null]);
    equal("grid session destination returns the original pane",
      gridSessionDestination([{ address: "b", tab: "tab-b" }],
        [{ terminal: "b", pane: "pane-b" }], [{ address: "b", pane: "pane-agent-b" }], "b"),
      { pane: "pane-agent-b" });
    equal("grid helper destination returns to peek",
      gridSessionDestination([{ address: "helper", tab: "tab-b" }],
        [{ terminal: "helper", pane: null }], [{ address: "helper", pane: null }], "helper"),
      { tab: "tab-b", terminal: "helper" });
    equal("grid navigation key commands", ["left", "right", "up", "down"].map(d =>
      gridNavigationCommand(d)), ["left", "right", "up", "down"]);
    equal("grid navigation namespaced commands", ["navigate:left", "navigate:right", "navigate:up", "navigate:down",
      "panopticon.left", "panopticon.right", "panopticon.up", "panopticon.down"].map(d =>
      gridNavigationCommand(d)), ["left", "right", "up", "down", "left", "right", "up", "down"]);
    equal("grid navigation rejects unknown commands", gridNavigationCommand("tab.next"), null);
    equal("grid navigation empty", gridNavigationAddress([], "right", null), null);
    equal("brand geometry", BRAND_GEOMETRY, {
      size: 256, center: 128, cells: 8, outer: 106, inner: 73, gap: 7,
      panes: [99, 132], paneSize: 25, paneRadius: 5,
    });
    equal("geometry is immutable", Object.isFrozen(BRAND_GEOMETRY), true);
    equal("pane positions are immutable", Object.isFrozen(BRAND_GEOMETRY.panes), true);

    const locations = [
      { name: "Beacon", tabs: [{ id: "review", name: "API review", named: true },
        { id: "default", name: "1", named: false }, { id: "numeric", name: "7", named: true }] },
      { name: "Relay", tabs: [{ id: "remote", name: "API review", named: true }] },
    ];
    const claude = { name: "Claude Code", key: "claude", agent: true, icon: "icons/test-color.svg", tint: false };
    const pi = { name: "Pi", key: "pi", agent: true, icon: "icons/test-mono.svg", tint: true };
    const owners = [
      { terminal: "t3", tab: "review", pane: "p3", program: claude },
      { terminal: "t4", tab: "default", pane: "p4", program: pi, status: "idle" },
      { terminal: "t5", tab: "review", pane: "p5", program: claude },
      { terminal: "remote/t3", tab: "remote", pane: "remote/p3", program: claude },
      { terminal: "t7", tab: "numeric", pane: "p7", program: pi },
    ];
    const reports = [{ address: "t3", pane: "p3", program: claude,
      title: "Reviewing response handling", status: "blocked" }];
    const helpers = ["helper1", "helper2"].map(address => ({ address, program: pi,
      title: "Current activity", parent: "t3", status: "working" }));
    const named = { address: "t3", tab: "review" }, helper = { address: "helper1", tab: "review" };
    const basic = sessionCaptions([named, { address: "t4", tab: "default" },
      { address: "t7", tab: "numeric" }, helper], locations, owners, reports, helpers, "t3");
    equal("existing tab name leads", basic[0].name, "API review");
    equal("workspace and tool are secondary", basic[0].detail, "Beacon · Claude Code");
    equal("unique captions hide addresses", basic.map(c => c.id), [null, null, null, null]);
    equal("unnamed tabs fall back to the program like default tabs", basic[1].name, "Pi");
    equal("explicit numeric names are preserved", basic[2].name, "7");
    equal("helpers keep their owner's task name", basic[3].name, "API review");
    equal("helpers are identified in metadata", basic[3].detail, "Beacon · Pi helper");
    equal("captions use agent, pane and helper program icons", basic.map(c => [c.icon, c.tint]), [
      [claude.icon, false], [pi.icon, true], [pi.icon, true], [pi.icon, true],
    ]);
    equal("pane destination is preserved", basic[0].pane, "p3");
    equal("currently focused caption is marked", [basic[0].focused, basic[1].focused], [true, false]);
    equal("focused tooltip is explicit", basic[0].tooltip.includes("Currently focused"), true);
    equal("helper still peeks over its owning tab", [basic[3].pane, basic[3].tab], [null, "review"]);
    equal("tooltip keeps debug address and destination", basic[0].tooltip.includes("t3")
      && basic[0].tooltip.includes("Go to original pane"), true);
    equal("helper tooltip keeps peek destination", basic[3].tooltip.includes("Peek at agent"), true);

    const peers = [named, { address: "t5", tab: "review" }, helper,
      { address: "helper2", tab: "review" }, { address: "remote/t3", tab: "remote" }];
    const before = JSON.stringify([peers, locations, owners, reports, helpers]);
    const duplicates = sessionCaptions(peers, locations, owners, reports, helpers);
    equal("only identical labels need visible IDs", duplicates.map(c => c.id), ["t3", "t5", "helper1", "helper2", null]);
    equal("presentation does not mutate source data", JSON.stringify([peers, locations, owners, reports, helpers]), before);
    const changed = sessionCaptions(peers, locations, owners,
      reports.map(a => ({ ...a, status: "working", title: "Running tests" })), helpers);
    const identities = list => list.map(({ address, name, detail, id, pane }) => ({ address, name, detail, id, pane }));
    equal("custom captions stay put through status/activity changes", identities(changed), identities(duplicates));

    const autoTab = { id: "auto", name: "2", named: false };
    const automatic = (title, tab = autoTab, program = claude, address = "auto/t") => sessionCaptions(
      [{ address, tab: tab.id }], [{ name: "Beacon", tabs: [tab] }],
      [{ terminal: address, tab: tab.id, pane: "auto/p", program, title }], [], [])[0];
    equal("unnamed tabs follow the cleaned live session title", automatic("✦ Review response handling").name,
      "Review response handling");
    equal("program-named tabs follow the live session title",
      automatic("my-task", { ...autoTab, name: "Claude Code", named: true }).name, "my-task");
    equal("custom names override the live title",
      automatic("my-task", { ...autoTab, name: "fix login", named: true }).name, "fix login");
    equal("explicit numeric names override the live title",
      automatic("my-task", { ...autoTab, name: "7", named: true }).name, "7");
    equal("legacy custom names are preserved without a named flag",
      automatic("my-task", { id: "auto", name: "fix login" }).name, "fix login");
    equal("legacy numeric slots use the live title without a named flag",
      automatic("my-task", { id: "auto", name: "2" }).name, "my-task");
    for (const [title, expected] of [
      ["✦ [web] login", "[web] login"], ["⠋ - Thinking", "Thinking"],
      ["[ ! ] Implement login", "Implement login"], ["[ . ] Implement login", "Implement login"],
      ["“login flow”", "“login flow”"], ["修复登录", "修复登录"],
      ["", "Claude Code"], ["✦", "Claude Code"], ["Claude Code", "Claude Code"], ["CLAUDE", "Claude Code"],
      ["me@build-box", "Claude Code"], ["~/src/api", "Claude Code"], ["✦ /tmp", "Claude Code"],
      ["C:\\src\\api", "Claude Code"], ["✦ C:\\src\\api", "Claude Code"],
    ]) {
      equal(`default-style title cleaning: ${JSON.stringify(title)}`, automatic(title).name, expected);
    }
    for (const address of ["t2", "remote/t2"]) {
      equal("address titles fall back to the program", automatic(address, autoTab, claude, address).name, "Claude Code");
      equal("address titles do not replace program-named tabs",
        automatic(address, { ...autoTab, name: "Claude Code", named: true }, claude, address).name, "Claude Code");
    }
    equal("non-agent program titles never replace the name",
      automatic("vim notes.md", autoTab, { name: "zsh", key: "zsh", shell: true }).name, "zsh");
    const missingProgram = automatic("my-task", autoTab, null);
    equal("missing program metadata has an agent fallback", missingProgram.name, "Agent");
    equal("missing program metadata has no icon", [missingProgram.icon, missingProgram.tint], [null, false]);
    const iconless = automatic("my-task", autoTab, { ...claude, icon: null });
    equal("programs without an icon keep their title", [iconless.name, iconless.icon], ["my-task", null]);
    equal("raw live titles remain in the tooltip", automatic("✦ [web] login").tooltip.includes("✦ [web] login"), true);

    const autoItems = [{ address: "auto/1", tab: "auto" }, { address: "auto/2", tab: "auto" },
      { address: "auto/helper", tab: "auto" }];
    const autoSpaces = [{ name: "Beacon", tabs: [autoTab] }];
    const autoPanes = [
      { terminal: "auto/1", pane: "auto/p1", program: claude, title: "✦ First task" },
      { terminal: "auto/2", pane: "auto/p2", program: claude, title: "Second task" },
    ];
    const autoHelpers = [{ address: "auto/helper", program: pi, title: "[ . ] Check tests", parent: "auto/1" }];
    const autoBefore = sessionCaptions(autoItems, autoSpaces, autoPanes, [], autoHelpers);
    equal("split agents and helpers use their own session titles", autoBefore.map(c => c.name),
      ["First task", "Second task", "Check tests"]);
    equal("distinct session titles need no visible address", autoBefore.map(c => c.id), [null, null, null]);
    equal("automatic helpers keep their destination and metadata",
      [autoBefore[2].pane, autoBefore[2].tab, autoBefore[2].detail], [null, "auto", "Beacon · Pi helper"]);
    const autoAfter = sessionCaptions(autoItems, autoSpaces,
      autoPanes.map(p => ({ ...p, title: "✦ Renamed task", status: "working" })), [], autoHelpers);
    equal("automatic captions refresh with session titles", autoAfter.map(c => c.name),
      ["Renamed task", "Renamed task", "Check tests"]);
    equal("identical live labels are disambiguated", autoAfter.map(c => c.id), ["auto/1", "auto/2", null]);
    const destinations = list => list.map(({ address, tab, pane }) => ({ address, tab, pane }));
    equal("title/status updates preserve order and destinations", destinations(autoAfter), destinations(autoBefore));
    const mixedPanes = sessionCaptions(autoItems, autoSpaces,
      [autoPanes[0], { ...autoPanes[1], program: pi }], [], autoHelpers);
    equal("panes in the same tab use their own harness icons", mixedPanes.map(c => [c.icon, c.tint]), [
      [claude.icon, false], [pi.icon, true], [pi.icon, true],
    ]);
    const changedIcons = sessionCaptions(autoItems, autoSpaces,
      autoPanes.map(p => ({ ...p, program: { ...p.program, icon: pi.icon, tint: true } })), [], autoHelpers);
    equal("icon changes never rename, reorder or retarget captions", identities(changedIcons), identities(autoBefore));
    equal("status-only updates leave captions unchanged", identities(sessionCaptions(autoItems, autoSpaces,
      autoPanes.map(p => ({ ...p, status: "blocked" })), [], autoHelpers)), identities(autoBefore));
    equal("empty caption list", sessionCaptions([], locations, owners, reports, helpers), []);
    const colors = { chrome: "#21252b", selected: "#30343b", hover: "#30343b", foreground: "#e9eee9", muted: "#91aaa9",
      dim: "#677777", accent: "#abefdc", blocked: "#ff765c", working: "#f7d38a" };
    // Exercise full-color images, theme-tinted SVGs, iconless captions and native brand paths.
    // Test icon assets live only in the scratch app home; the install still has two mod files.
    return div().flex().items_center().gap(12).child("Panopticon grid, caption, harness icon and brand checks passed")
      .child(div().w(360).h(26).child(captionRow(basic[0], colors)))
      .child(div().w(240).h(26).child(captionRow(duplicates[2], colors)))
      .child(div().w(240).h(26).child(captionRow(autoBefore[2], { ...colors, dim: "#526573", foreground: "#111d23" })))
      .child(div().w(240).h(26).child(captionRow(iconless, colors)))
      .child(div().w(240).h(26).child(captionRow(missingProgram, colors)))
      .child(brandMark(24, { foreground: "#e9eee9", accent: "#abefdc" }))
      .child(brandMark(48, { foreground: "#111d23", accent: "#286e5b" }))
      .child(brandMark(24, { foreground: "#111d23" }));
  }
}
