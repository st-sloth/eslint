/**
 * @fileoverview Plugins manager
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const debug = require("debug")("eslint:plugins");
const naming = require("../util/naming");
const path = require("path");

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------



/**
 * Determines if a given string represents a filepath or not using the same
 * conventions as require(), meaning that the first character must be nonalphanumeric
 * and not the @ sign which is used for scoped packages to be considered a file path.
 * @param {string} filePath The string to check.
 * @returns {boolean} True if it's a filepath, false if not.
 * @private
 */
function isFilePath(filePath) {
    return path.isAbsolute(filePath) || !/\w|@/.test(filePath.charAt(0));
}

/**
 * Plugin class
 */
class Plugins {

    /**
     * Creates the plugins context
     * @param {Environments} envContext - env context
     * @param {function(string, Rule): void} defineRule - Callback for when a plugin is defined which introduces rules
     */
    constructor(envContext, defineRule) {
        this._plugins = Object.create(null);
        this._environments = envContext;
        this._defineRule = defineRule;
    }

    /**
     * Defines a plugin with a given name rather than loading from disk.
     * @param {string} pluginName The name of the plugin to load.
     * @param {Object} plugin The plugin object.
     * @returns {void}
     */
    define(pluginName, plugin) {
        const longName = naming.normalizePackageName(pluginName, "eslint-plugin");
        const shortName = naming.getShorthandName(longName, "eslint-plugin");

        // load up environments and rules
        this._plugins[shortName] = plugin;
        this._environments.importPlugin(plugin, shortName);

        if (plugin.rules) {
            Object.keys(plugin.rules).forEach(ruleId => {
                const qualifiedRuleId = `${shortName}/${ruleId}`,
                    rule = plugin.rules[ruleId];

                this._defineRule(qualifiedRuleId, rule);
            });
        }
    }

    /**
     * Gets a plugin with the given name.
     * @param {string} pluginName The name of the plugin to retrieve.
     * @returns {Object} The plugin or null if not loaded.
     */
    get(pluginName) {
        return this._plugins[pluginName] || null;
    }

    /**
     * Returns all plugins that are loaded.
     * @returns {Object} The plugins cache.
     */
    getAll() {
        return this._plugins;
    }

    /**
     * Loads a plugin with the given name.
     * @param {string} pluginName The name of the plugin to load.
     * @returns {void}
     * @throws {Error} If the plugin cannot be loaded.
     */
    load(pluginName) {
        let longName;
        let shortName;
        let plugin = null;

        // Allow for the plugin to be specified with a resolved path
        if (isFilePath(pluginName)) {
            // TODO not exactly longName
            longName = pluginName;
            shortName = naming.getShorthandName(longName, "eslint-plugin");
        } else {
            longName = naming.normalizePackageName(pluginName, "eslint-plugin");
            shortName = naming.getShorthandName(longName, "eslint-plugin");
        }

        if (pluginName.match(/\s+/)) {
            const whitespaceError = new Error(`Whitespace found in plugin name '${pluginName}'`);

            whitespaceError.messageTemplate = "whitespace-found";
            whitespaceError.messageData = {
                pluginName: longName
            };
            throw whitespaceError;
        }

        if (!this._plugins[shortName]) {
            try {
                plugin = require(longName);
            } catch (pluginLoadErr) {
                try {

                    // Check whether the plugin exists
                    require.resolve(longName);
                } catch (missingPluginErr) {

                    // If the plugin can't be resolved, display the missing plugin error (usually a config or install error)
                    debug(`Failed to load plugin ${longName}.`);
                    missingPluginErr.message = `Failed to load plugin ${pluginName}: ${missingPluginErr.message}`;
                    missingPluginErr.messageTemplate = "plugin-missing";
                    missingPluginErr.messageData = {
                        pluginName: longName,
                        eslintPath: path.resolve(__dirname, "../..")
                    };
                    throw missingPluginErr;
                }

                // Otherwise, the plugin exists and is throwing on module load for some reason, so print the stack trace.
                throw pluginLoadErr;
            }

            // This step is costly, so skip if debug is disabled
            if (debug.enabled) {
                const resolvedPath = require.resolve(longName);

                let version = null;

                try {
                    version = require(`${longName}/package.json`).version;
                } catch (e) {

                    // Do nothing
                }

                const loadedPluginAndVersion = version
                    ? `${longName}@${version}`
                    : `${longName}, version unknown`;

                debug(`Loaded plugin ${pluginName} (${loadedPluginAndVersion}) (from ${resolvedPath})`);
            }

            this.define(pluginName, plugin);
        }
    }

    /**
     * Loads all plugins from an array.
     * @param {string[]} pluginNames An array of plugins names.
     * @returns {void}
     * @throws {Error} If a plugin cannot be loaded.
     * @throws {Error} If "plugins" in config is not an array
     */
    loadAll(pluginNames) {

        // if "plugins" in config is not an array, throw an error so user can fix their config.
        if (!Array.isArray(pluginNames)) {
            const pluginNotArrayMessage = "ESLint configuration error: \"plugins\" value must be an array";

            debug(`${pluginNotArrayMessage}: ${JSON.stringify(pluginNames)}`);

            throw new Error(pluginNotArrayMessage);
        }

        // load each plugin by name
        pluginNames.forEach(this.load, this);
    }
}

module.exports = Plugins;
