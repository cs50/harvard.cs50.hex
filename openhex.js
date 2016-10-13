define(function(require, exports, module) {
    main.consumes = [
        "c9", "dialog.error", "menus", "Plugin", "tabManager", "tree", "ui"
    ];
    main.provides = ["harvard.cs50.openhex"];

    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var menus = imports.menus;
        var Plugin = imports.Plugin;
        var showError = imports["dialog.error"];
        var tabManager = imports.tabManager;
        var tree = imports.tree;
        var ui = imports.ui;

        var plugin = new Plugin("CS50", main.consumes);

        /**
         * Opens selected files in the hex editor
         */
        function openSelection() {
            // ensure storage capabilities are available
            if (!c9.has(c9.STORAGE))
                return;

            // get selected files
            var nodes = tree.selectedNodes;
            var last = nodes.length - 1;

            // disable opening animation when multiple files are opened
            var noanim = nodes.length > 1;

            // open selected files
            nodes.forEach(function(node, i) {
                var tab;

                // focus tab only if last to avoid sending multiple requests
                var focus = i === last;

                // ensure selection is a file
                if (!node.isFolder) {
                    // ensure no hex tab is open for file
                    var openInHex = tabManager.getTabs().some(function(t) {
                        if (t.path === node.path && t.editorType === "hex") {
                            tab = t;
                            return true;
                        }

                        return false;
                    });

                    if (openInHex)
                        return focus && tabManager.focusTab(tab);

                    // find tab where file is open with other editor (if any)
                    tab = tabManager.findTab(node.path);

                    // handle when file is open with other editor
                    if (tab) {
                        // force-open file with hex in new tab
                        // TODO fix forceNew and use it instead
                        return tabManager.open({
                            pane: tab.pane,
                            tab: tab,
                            editorType: "hex",
                            focus: false,
                            document: {
                                meta: { cloned: true }
                            }
                        }, function(err, tab) {
                            // handle errors
                            if (err)
                                return showError(err);

                            if (tab) {
                                tab.document.progress({ complete: true });

                                // focus tab only if last one
                                if (focus)
                                    tabManager.focusTab(tab);
                            }
                        });
                    }

                    // open file with hex
                    tabManager.open({
                        path: node.path,
                        editorType: "hex",
                        active: focus,
                        focus: focus,
                        noanim: noanim
                    });
                }
            });
        }

        plugin.on("load", function() {
            // add "Open Hex" to file-browser's context menu
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                menus.addItemToMenu(mnuCtxTree, new ui.item({
                    caption: "Open Hex",
                    onclick: openSelection,
                    match: "file"
                }), 100, plugin);
            });
        });

        plugin.on("unload", function() {});

        /***** Register and define API *****/

        register(null, {
            "harvard.cs50.openhex": plugin
        });
    }
});