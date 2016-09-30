define(function(require, exports, module) {
    main.consumes = [
        "c9", "dialog.error", "Editor", "editors", "layout", "proc",
        "settings", "ui"
    ];
    main.provides = ["harvard.cs50.hex"];

    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var Editor = imports.Editor;
        var editors = imports.editors;
        var layout = imports.layout;
        var proc = imports.proc;
        var settings = imports.settings;
        var showError = imports["dialog.error"].show;
        var ui = imports.ui;

        var _ = require("lodash");
        var join = require("path").join;

        // no default extensions
        var extensions = [];

        // register editor
        var handle = editors.register("hex", "Hex", Hex, extensions);

        // whether CSS for the editor is inserted
        var cssInserted = false;

        /**
         * Inserts CSS for the editor once
         */
        handle.insertCss = function() {
            // ensure CSS is inserted only once
            if (cssInserted)
                return;

            cssInserted = true;
            ui.insertCss(require("text!./style.css"), options.staticPrefix, handle);
        };

        /**
         * Editor's factory
         */
        function Hex() {
            var plugin = new Editor("CS50", main.consumes, extensions);

            // active document and session
            var currDoc = null;
            var currSession = null;

            // GUI elements
            var bar = null;
            var configElements = {};
            var content = null;

            // xxd process object
            var xxdProc = null;

            plugin.on("draw", function(e) {
                // ensure CSS is inserted
                handle.insertCss();

                // draw editor
                ui.insertMarkup(e.tab, require("text!./hex.xml"), plugin);

                // get configs bar
                plugin.getElement("configs", function(b) {
                    bar = b;
                });

                // get content textarea
                plugin.getElement("content", function(e) {
                    content = e;

                    // sync font size of hex representation with Ace's font size
                    setFontSize(settings.getNumber("user/ace/@fontSize"));
                    settings.on("user/ace/@fontSize", setFontSize);

                    // make content read-only
                    content.$ext.setAttribute("readonly", "true");
                });

                // get "Bytes per row" spinner
                plugin.getElement("rowBytes", function(e) {
                    configElements.rowBytes = e;

                    /**
                     * @returns {string} xxd argument representation for this config
                     */
                    configElements.rowBytes.getArg = function(d) {
                        return "-c".concat(
                            d === true || !_.isNumber(configElements.rowBytes.value)
                                ? configElements.rowBytes.defaultValue
                                : configElements.rowBytes.value
                        );
                    };
                });

                // get "Bytes per column" spinner
                plugin.getElement("colBytes", function(e) {
                    configElements.colBytes = e;

                    /**
                     * @returns {string} xxd argument representation for this config
                     */
                    configElements.colBytes.getArg = function(d) {
                        return "-g".concat(
                            d === true || !_.isNumber(configElements.colBytes.value)
                                ? configElements.colBytes.defaultValue
                                : configElements.colBytes.value
                        );
                    };
                });

                // get "Offset" spinner
                plugin.getElement("offset", function(e) {
                    configElements.offset = e;

                    /**
                     * @returns {string} xxd argument representation for this config
                     */
                    configElements.offset.getArg = function(d) {
                        return "-s".concat(
                            d === true || !_.isNumber(configElements.offset.value)
                                ? configElements.offset.defaultValue
                                : configElements.offset.value
                        );
                    };
                });

                // get "Set" button
                plugin.getElement("btnSet", function(btnSet) {
                    btnSet.on("click", update);
                });
            });

            /**
             * Checks whether the xxd configs for the current document have changed
             *
             * @returns {boolean} true if configs have changed or false otherwise
             */
            function configChanged() {
                // get cached configs
                var elements = currSession.hex.configElements;

                // compare cached configs with the ones set per config elements
                for (var element in elements) {
                    if (configElements[element]) {
                        if (configElements[element].value != elements[element])
                            return true;
                    }
                    else {
                        console.warn("element " + element + " not found");
                    }
                }

                return false;
            }

            /**
             * Retrieves xxd configs and builds up its command-line args
             *
             * @param {boolean} [defaults] whether retrieve default configs
             */
            function getConfigs(defaults) {
                var configs = {};
                configs.configElements = {};
                configs.args = [];

                // iterate over the config elements
                for (var element in configElements) {
                    // cache configs in current session
                    configs.configElements[element] = defaults === true
                        ? configElements[element].defaultValue
                        : configElements[element].value;

                    // build up xxd args
                    configs.args.push(configElements[element].getArg(defaults));
                }

                return configs;
            }


            /**
             * Renders the configs and the hex representation of the current document
             */
            function render() {
                if (!currSession)
                    return;

                // sync configs
                var elements = currSession.hex.configElements;
                for (var element in elements) {
                    // ensure there's a config element associated with the config
                    if (configElements[element])
                        configElements[element].setAttribute("value", elements[element]);
                    // warn if not
                    else
                        console.warn("element " + element + " not found");
                }

                // render hex content
                if (content)
                    // using setAttribute fails (lib_apf tries to compile hex content)
                    content.$ext.value = currSession.hex.content;
            }

            /**
             * Resets configs and hex representation of current document
             */
            function reset() {
                if (currentSession) {
                    currentSession.hex.configElements = {};
                    currentSession.hex.content = "";
                }
            }

            /**
             * Sets the font size of the hex representation
             *
             * @param {Number} size the size to set
             */
            function setFontSize(size) {
                if (content)
                    content.$ext.style.fontSize = size + "px";
            }

            /**
             * Updates and renders hex representation for current document per
             * the configs
             */
            function update() {
                // handle when no content has been set yet or configs have changed
                if (_.isEmpty(currSession.hex.content) || configChanged()) {
                    // ensure only one xxd process running per editor instance
                    if (xxdProc !== null)
                        return showError("Error starting hex conversion process");

                    // get config values
                    var configs = getConfigs(_.isEmpty(currSession.hex.configElements));

                    // reset content
                    currSession.hex.content = "";

                    // cache configs into session
                    currSession.hex.configElements = configs.configElements;

                    // launch xxd
                    xxdProc = proc.spawn("xxd", {
                        args: configs.args.concat(currSession.hex.path)
                    }, function(err, process) {
                        if (err) {
                            // empty content of current document
                            currSession.hex.content = "";
                            return showError(err);
                        }

                        // buffer xxd's stdout
                        process.stdout.on("data", function(chunk) {
                            currSession.hex.content += chunk;
                        });

                        // render xxd's output
                        process.stdout.on("end", function() {
                            render();
                        });

                        // handle xxd errors
                        process.on("error", function(err) {
                            console.error(err);

                            // empty content of current document
                            reset();
                            showError("Error converting to hex");
                        });

                        // when xxd exists
                        process.on("exit", function(code, signal) {
                            // allow spawning xxd again for this editor
                            xxdProc = null;
                        });
                    });
                }
                // handle activating another tab
                else {
                    render();
                }
            }

            plugin.on("documentLoad", function(e) {
                var doc = e.doc;

                /**
                 * Updates editor's theme
                 */
                function setTheme(e) {
                    // get document's tab
                    var tab = doc.tab;

                    // handle dark themes
                    if (e.theme.indexOf("dark") > -1) {
                        // change tab-button colors
                        tab.backgroundColor = "#303130";
                        tab.classList.add("dark");

                        // change background of config bar
                        if (bar)
                            bar.$ext.classList.add("dark");

                        // change background of hex textarea
                        if (content)
                            content.$ext.classList.add("dark");
                    }
                    // handle light themes
                    else {
                        // change tab-button colors
                        tab.backgroundColor = "#f1f1f1";
                        tab.classList.remove("dark");

                        // change background of config bar
                        if (bar)
                            bar.$ext.classList.remove("dark");

                        // change background of hex textarea
                        if (content)
                            content.$ext.classList.remove("dark");
                    }
                }

                // update editor's theme as IDE theme changes
                layout.on("themeChange", setTheme, doc.getSession());

                // set editor's theme initially
                setTheme({ theme: settings.get("user/general/@skin") });
            });

            // handle when document receives focus
            plugin.on("documentActivate", function(e) {
                // ensure path is set
                if (!e.doc.tab.path)
                    return;

                // update current document
                currDoc = e.doc;

                // update current session
                currSession = currDoc.getSession();

                // build up configs initially
                if (!currSession.hex) {
                    // editor's configs for current document
                    currSession.hex = {};

                    // associated xxd configs
                    currSession.hex.configElements = {};

                    // hex representation
                    currSession.hex.content = "";

                    // absolute path
                    var path = currDoc.tab.path;
                    currSession.hex.path = path.indexOf("~") === 0
                        ? join(c9.home, path.substring(1))
                        : join(c9.workspaceDir, path);

                    // render hex representation
                    update();
                }
                else {
                    // render hex representation
                    render();
                }
            });

            // ensure content textarea is resized as pane is resized
            plugin.on("resize", function(){
                if (content) {
                    content.setAttribute("visible", false);
                    content.setAttribute("visible", true);
                }
            });

            plugin.freezePublicAPI({});

            plugin.load(null, "harvard.cs50.hex");

            return plugin;
        }

        /***** Register and define API *****/

        register(null, {
            "harvard.cs50.hex": handle
        });
    }
});