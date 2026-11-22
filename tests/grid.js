import { View, div } from "gpui-kit";
import {
  BRAND_GEOMETRY, brandMark, captionRow, gridLayout, gridNavigationAddress,
  gridNavigationCommand, gridSessions, sessionCaptions,
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

    const moving = [{ address: "a" }, { address: "b" }, { address: "c" }, { address: "d" }];
    equal("grid navigation right", gridNavigationAddress(moving, "right", "a"), "b");
    equal("grid navigation down", gridNavigationAddress(moving, "down", "a"), "c");
    equal("grid navigation left", gridNavigationAddress(moving, "left", "d"), "c");
    equal("grid navigation up", gridNavigationAddress(moving, "up", "d"), "b");
    equal("grid navigation stops at edges", [
      gridNavigationAddress(moving, "left", "a"),
      gridNavigationAddress(moving, "right", "d"),
      gridNavigationAddress(moving, "up", "a"),
      gridNavigationAddress(moving, "down", "d"),
    ], [null, null, null, null]);
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
    ], ["e", "e"]);
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
    const owners = [
      { terminal: "t3", tab: "review", pane: "p3", program: { name: "Claude Code" } },
      { terminal: "t4", tab: "default", pane: "p4", program: { name: "Pi" }, status: "idle" },
      { terminal: "t5", tab: "review", pane: "p5", program: { name: "Claude Code" } },
      { terminal: "remote/t3", tab: "remote", pane: "remote/p3", program: { name: "Claude Code" } },
      { terminal: "t7", tab: "numeric", pane: "p7", program: { name: "Pi" } },
    ];
    const reports = [{ address: "t3", pane: "p3", program: { name: "Claude Code" },
      title: "Reviewing response handling", status: "blocked" }];
    const helpers = ["helper1", "helper2"].map(address => ({ address, program: { name: "Pi" },
      title: "Current activity", parent: "t3", status: "working" }));
    const named = { address: "t3", tab: "review" }, helper = { address: "helper1", tab: "review" };
    const basic = sessionCaptions([named, { address: "t4", tab: "default" },
      { address: "t7", tab: "numeric" }, helper], locations, owners, reports, helpers);
    equal("existing tab name leads", basic[0].name, "API review");
    equal("workspace and tool are secondary", basic[0].detail, "Beacon · Claude Code");
    equal("unique captions hide addresses", basic.map(c => c.id), [null, null, null, null]);
    equal("unnamed tabs get an explicit slot label", basic[1].name, "Tab 1");
    equal("explicit numeric names are preserved", basic[2].name, "7");
    equal("helpers keep their owner's task name", basic[3].name, "API review");
    equal("helpers are identified in metadata", basic[3].detail, "Beacon · Pi helper");
    equal("pane destination is preserved", basic[0].pane, "p3");
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
    equal("status/activity changes never rename or reorder sessions", identities(changed), identities(duplicates));
    equal("empty caption list", sessionCaptions([], locations, owners, reports, helpers), []);
    const colors = { chrome: "#21252b", hover: "#30343b", foreground: "#e9eee9", muted: "#91aaa9",
      dim: "#677777", blocked: "#ff765c", working: "#f7d38a" };
    // Exercise native path construction at both sizes, with dark/light tokens and
    // a missing-accent fallback. The production install still has only two files.
    return div().flex().items_center().gap(12).child("Panopticon grid, caption and brand checks passed")
      .child(div().w(360).h(26).child(captionRow(basic[0], colors)))
      .child(div().w(240).h(26).child(captionRow(duplicates[2], colors)))
      .child(brandMark(24, { foreground: "#e9eee9", accent: "#abefdc" }))
      .child(brandMark(48, { foreground: "#111d23", accent: "#286e5b" }))
      .child(brandMark(24, { foreground: "#111d23" }));
  }
}
