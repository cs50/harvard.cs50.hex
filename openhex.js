define(function(require, exports, module) {
    main.consumes = ["c9", "menus", "Plugin", "tabManager", "tree", "ui"];
    main.provides = ["harvard.cs50.openhex"];

    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var menus = imports.menus;
        var Plugin = imports.Plugin;
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
                // ensure selection is a file
                if (!node.isFolder) {
                    tabManager.open({
                        path: node.path,
                        editorType: "hex",

                        // avoid "multiple processes" error when opening multiple files (by activating the last one only)
                        active: i === last,
                        focus: i === last,
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