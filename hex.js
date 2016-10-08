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
        var basename = require("path").basename;
        var join = require("path").join;

        // no default extensions
        var extensions = [];

        // register editor
        var handle = editors.register("hex", "Hex", Hex, extensions);

        /**
         * Adds or removes class "dark" to or from AMLElement(s)
         *
         * @param {Array} elements an array of AMLElements
         * @param {boolean} dark whether to add or remove class "dark"
         */
        handle.darken = function(elements, dark) {
            if (_.isArray(elements) && _.isBoolean(dark)) {
                elements.forEach(function(element) {
                    var c = element.getAttribute("class");
                    if (_.isString(c)) {
                        var i = c.indexOf("dark");

                        // add or remove "dark" class
                        if (dark && i === -1)
                            element.setAttribute("class", c.concat(" dark"));
                        else if (i > -1)
                            element.setAttribute("class", c.replace(/\sdark/, ""));
                    }
                });
            }
        };

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
         * Updates font size of an HTML element
         *
         * @param {HTMLElement} an HTML element
         * @param {number} size the font size to set
         */
        handle.updateFontSize = function(element, size) {
            if (_.isObject(element) && _.isObject(element.style))
                element.style.fontSize = size + "px";
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

            // whether we're currently updating
            var updating = false;

            // draw editor
            plugin.on("draw", function(e) {
                // ensure CSS is inserted
                handle.insertCss();

                // "Bytes per row" spinner
                configElements.rowBytes = new ui.spinner({
                    defaultValue: 16,
                    min: 1,
                    max: 256,
                    realtime: true
                });

                /**
                 * @returns {string} xxd argument representation for row bytes config
                 */
                configElements.rowBytes.getArg = function(d) {
                    return "-c".concat(
                        d === true || !_.isNumber(configElements.rowBytes.value)
                            ? configElements.rowBytes.defaultValue
                            : configElements.rowBytes.value
                    );
                };

                // "Bytes per column" spinner
                configElements.colBytes = new ui.spinner({
                    defaultValue: 2,
                    min: 1,
                    max: 256,
                    realtime: true
                });

                /**
                 * @returns {string} xxd argument representation for col bytes config
                 */
                configElements.colBytes.getArg = function(d) {
                    return "-g".concat(
                        d === true || !_.isNumber(configElements.colBytes.value)
                            ? configElements.colBytes.defaultValue
                            : configElements.colBytes.value
                    );
                };

                // "Offset" spinner
                configElements.offset = new ui.spinner({
                    defaultValue: 0,
                    min: 0,
                    realtime: true
                });

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

                // udpate on Enter
                configElements.rowBytes.on("keydown", update);
                configElements.colBytes.on("keydown", update);
                configElements.offset.on("keydown", update);

                // configs bar
                bar = new ui.bar({
                    id: "configs",
                    class: "cs50-hex-configs fakehbox aligncenter padding3",
                    height: "40",
                    childNodes: [
                        new ui.label({caption : "Bytes per row: "}),
                        configElements.rowBytes,
                        new ui.divider({
                            class: "cs50-hex-divider",
                            skin: "c9-divider"
                        }),
                        new ui.label({caption : "Bytes per column: "}),
                        configElements.colBytes,
                        new ui.divider({
                            class: "cs50-hex-divider",
                            skin: "c9-divider"
                        }),
                        new ui.label({caption : "Bytes per offset: "}),
                        configElements.offset,
                        new ui.divider({
                            class: "cs50-hex-divider",
                            skin: "c9-divider"
                        }),
                        new ui.button({
                            caption: "Set",
                            class: "btn-green",
                            onclick: update,
                            skin: "btn-default-css3"
                        })
                    ]
                });

                // hex content
                content = new ui.textarea({
                    id: "content",
                    border: 0,
                    class: "cs50-hex-content",
                    height: "100%",
                    width: "100%"
                });

                // handle when text area is drawn
                content.on("DOMNodeInsertedIntoDocument", function(e) {
                    // sync font size of hex representation with Ace's font size
                    handle.updateFontSize(content.$ext, settings.getNumber("user/ace/@fontSize"));
                    settings.on("user/ace/@fontSize", function(size) {
                        handle.updateFontSize(content.$ext, size);
                    });

                    // make content read-only
                    content.$ext.setAttribute("readonly", "true");
                });

                // wrapper
                var vbox = new ui.vsplitbox({
                    childNodes: [
                        bar,
                        new ui.bar({childNodes: [content]})
                    ]
                });
                plugin.addElement(vbox);
                e.tab.appendChild(vbox);
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
                if (content && content.$ext)
                    // using setAttribute fails (lib_apf tries to compile hex content)
                    content.$ext.value = currSession.hex.content;
            }

            /**
             * Resets updating state, and possibly configs and hex representation
             *
             * @param {boolean} [all] whether to reset configs and hex representation
             * for current document
             */
            function reset(all) {
                if (all === true && currentSession) {
                    currentSession.hex.configElements = {};
                    currentSession.hex.content = "";
                }

                updating = false;
            }

            /**
             * Updates and renders hex representation for current document per
             * the configs
             *
             * @param {object} e an object as passed to AMLElement.keydown's callback
             */
            function update(e) {
                // if key pressed, ensure it's Enter
                if (_.isObject(e) && e.name === "keydown" && e.keyCode !== 13)
                    return;

                // handle when no content has been set yet or configs have changed
                if (_.isEmpty(currSession.hex.content) || configChanged()) {
                    // ensure single sed and xxd processes are running per editor at a time
                    if (updating === true)
                        return showError("Error starting hex conversion process");

                    updating = true;

                    // get config values
                    var configs = getConfigs(_.isEmpty(currSession.hex.configElements));

                    // reset content
                    currSession.hex.content = "";

                    // cache configs into session
                    currSession.hex.configElements = configs.configElements;

                    // launch sed to remove addresses
                    proc.spawn("sed", {
                        args: ["s/^.*:\\s*//g"]
                    }, function (err, sed) {
                        if (err) {
                            console.log(err);
                            reset(true);

                            // TODO show descriptive error message
                            return;
                        }

                        // handle sed errors
                        sed.on("error", function(err) {
                            console.error(err);
                            reset(true);

                            // TODO show descriptive error message
                        });

                        // handle sed exit
                        sed.on("exit", function(code) {
                            if (code === 0)
                                reset();
                        });

                        // launch xxd
                        proc.spawn("xxd", {
                            args: configs.args.concat(currSession.hex.path)
                        }, function(err, xxd) {
                            if (err) {
                                console.log(err);
                                reset(true);
                                return showError("Error starting hex conversion process");
                            }

                            // handle xxd errors
                            xxd.on("error", function(err) {
                                console.error(err);
                                reset(true);
                                showError("Error converting to hex");
                            });

                            // pipe xxd's stdout into sed's stdin
                            xxd.stdout.pipe(sed.stdin);

                            // buffer sed's stdout
                            sed.stdout.on("data", function(chunk) {
                                currSession.hex.content += chunk;
                            });

                            // render hex representation
                            sed.stdout.on("end", render);
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
                var session = doc.getSession();

                /**
                 * Updates editor's theme
                 *
                 * @param {object} e an object as passed to layout.themeChange's callback
                 */
                function setTheme(e) {
                    // get document's tab
                    var tab = doc.tab;

                    // handle dark themes
                    if (e.theme.indexOf("dark") > -1) {
                        // change tab-button colors
                        tab.backgroundColor = "#303130";
                        tab.classList.add("dark");

                        // update config bar and content colors
                        handle.darken([bar, content], true);
                    }
                    // handle light themes
                    else {
                        // change tab-button colors
                        tab.backgroundColor = "#f1f1f1";
                        tab.classList.remove("dark");

                        // update config bar and content colors
                        handle.darken([bar, content], false);
                    }
                }

                // update editor's theme as IDE theme changes
                layout.on("themeChange", setTheme, session);

                // set editor's theme initially
                setTheme({ theme: settings.get("user/general/@skin") });


                /**
                 * Sets document's title and tooltip to filename and full path
                 * respectively
                 *
                 * @param {object} e an object as passed to Tab.setPath's callback
                 */
                function setTitle(e) {
                    // get document's path
                    var path = doc.tab.path;

                    // set document's title to filename
                    doc.title = basename(path);

                    // set tab-button's tooltip to full path
                    doc.tooltip = path;
                }

                // set document's title initially
                setTitle();

                // handle when path changes (e.g., file renamed while open)
                doc.tab.on("setPath", setTitle, session);
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