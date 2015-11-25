﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/Q.d.ts" />
/// <reference path="../typings/tacoJsonMetadata.d.ts" />
/// <reference path="../typings/tacoJsonEditParams.d.ts" />
/// <reference path="../typings/tacoProjectInfo.d.ts" />

import child_process = require("child_process");
import fs = require ("fs");
import Q = require ("q");
import path = require ("path");
import wrench = require ("wrench");

import cordovaHelper = require ("./cordovaHelper");
import errorHelper = require ("./tacoErrorHelper");
import jsonSerializer = require ("./jsonSerializer");
import logger = require ("./logger");
import tacoErrorCodes = require ("./tacoErrorCodes");
import telemetryHelper = require ("./telemetryHelper");
import utilHelper = require ("./utilHelper");

import CordovaHelper = cordovaHelper.CordovaHelper;
import ICommandTelemetryProperties = telemetryHelper.ICommandTelemetryProperties;
import JsonSerializer = jsonSerializer.JsonSerializer;
import Logger = logger.Logger;
import TacoErrorCodes = tacoErrorCodes.TacoErrorCode;
import TelemetryHelper = telemetryHelper.TelemetryHelper;
import UtilHelper = utilHelper.UtilHelper;

module TacoUtility {
    interface IPluginFetchInfo {
        [plugin: string]: {
            source: {
                type: string;
                id: string;
            };
            "is_top_level": boolean;
        };
    }
    /**
     *  A helper class with methods to query the project root, project info like CLI/kit version etc.
     */
    export class ProjectHelper {
        private static TACO_JSON_FILENAME: string = "taco.json";
        private static CONFIG_XML_FILENAME: string = "config.xml";
        private static PROJECTS_SCRIPTS_DIR: string = "scripts";

        private static cachedProjectInfo: Q.Promise<IProjectInfo> = null;
        private static cachedProjectFilePath: string = null;

        /**
         *  Helper to create the taco.json file in the project root {projectPath}. Invoked by
         *  the create command handler after the actual project creation  
         */
        public static editTacoJsonFile(editParams: ITacoJsonEditParams, cordovaCliVersion: string): Q.Promise<any> {
            ProjectHelper.cachedProjectInfo = null;
            ProjectHelper.cachedProjectFilePath = null;
            var deferred: Q.Deferred<any> = Q.defer<any>();
            var tacoJsonPath: string = path.resolve(editParams.projectPath, ProjectHelper.TACO_JSON_FILENAME);
            var tacoJson: ITacoJsonMetadata = fs.existsSync(tacoJsonPath) ? require(tacoJsonPath) : {};

            if (editParams.isKitProject) {
                tacoJson.kit = editParams.version;
                tacoJson["cordova-cli"] = cordovaCliVersion;
                return ProjectHelper.createJsonFileWithContents(tacoJsonPath, tacoJson);
            } else {
                if (tacoJson.kit) {
                    delete tacoJson.kit;
                }

                if (!editParams.version) {
                    deferred.reject(errorHelper.get(TacoErrorCodes.CommandCreateTacoJsonFileCreationError));
                    return deferred.promise;
                }

                tacoJson["cordova-cli"] = editParams.version;
                return ProjectHelper.createJsonFileWithContents(tacoJsonPath, tacoJson);
            }
        }

        /**
         *  Helper to find the root of the project. Invoked by taco command handlers to detect
         *  the project root directory. Returns null in the case of directories which are
         *  not cordova-based projects. Otherwise, the project root path as string.
         */
        public static getProjectRoot(): string {
            var projectPath: string = process.cwd();
            var parentPath: string;
            var atFsRoot: boolean = false;
            while (fs.existsSync(projectPath) && !fs.existsSync(path.join(projectPath, ProjectHelper.TACO_JSON_FILENAME)) && !fs.existsSync(path.join(projectPath, ProjectHelper.CONFIG_XML_FILENAME))) {
                // Navigate up one level until either taco.json is found or the parent path is invalid
                parentPath = path.resolve(projectPath, "..");
                if (parentPath !== projectPath) {
                    projectPath = parentPath;
                } else {
                    // we have reached the filesystem root
                    atFsRoot = true;
                    break;
                }
            }

            if (atFsRoot) {
                // We reached the fs root, so the project path passed was not a Cordova-based project directory
                return null;
            }

            return projectPath;
        }

        /**
         * Helper function to change the current directory to the project root, if possible.
         * If we can't find a taco.json then it will not change directory
         */
        public static cdToProjectRoot(): void {
            var tacoRoot: string = ProjectHelper.getProjectRoot();
            if (tacoRoot) {
                process.chdir(tacoRoot);
                // Cordova checks for process.env.PWD before checkign process.cwd, and process.env.PWD is not changed by process.chdir()
                // If we happened to be in a scenario where a taco project contained a separate cordova project, this way we ensure that
                // both taco and cordova will operate on the same project rather than our own taco stuff modifying things in tacoRoot and
                // cordova commands modifying things somewhere else.
                process.env.PWD = tacoRoot;
            }
        }

        /**
         *  Helper to get info regarding the current project.  
         *  An object of type IProjectInfo is returned to the caller.
         */
        public static getProjectInfo(): Q.Promise<IProjectInfo> {

            return Q.fcall(ProjectHelper.getProjectRoot).then((projectPath: string): IProjectInfo | Q.Promise<IProjectInfo> => {
                var projectInfo: IProjectInfo = {
                    isTacoProject: false,
                    cordovaCliVersion: "",
                    configXmlPath: "",
                    tacoKitId: ""
                };
                if (!projectPath) {
                    return projectInfo;
                }

                var tacoJson: ITacoJsonMetadata;
                var tacoJsonFilePath: string = path.join(projectPath, ProjectHelper.TACO_JSON_FILENAME);
                var configFilePath: string = path.join(projectPath, ProjectHelper.CONFIG_XML_FILENAME);

                if (ProjectHelper.cachedProjectInfo) {
                    if (tacoJsonFilePath === ProjectHelper.cachedProjectFilePath) {
                        return ProjectHelper.cachedProjectInfo;
                    } else {
                        ProjectHelper.cachedProjectInfo = null;
                    }
                }

                if (fs.existsSync(configFilePath)) {
                    projectInfo.configXmlPath = configFilePath;
                }

                if (fs.existsSync(tacoJsonFilePath)) {
                    tacoJson = UtilHelper.parseUserJSON(tacoJsonFilePath);
                    ProjectHelper.cachedProjectFilePath = tacoJsonFilePath;
                } else {
                    return projectInfo;
                }

                if (tacoJson.kit) {
                    projectInfo.isTacoProject = true;
                    projectInfo.tacoKitId = tacoJson.kit;
                    projectInfo.cordovaCliVersion = tacoJson["cordova-cli"];
                    return projectInfo;
                } else if (tacoJson["cordova-cli"]) {
                    projectInfo.isTacoProject = true;
                    projectInfo.cordovaCliVersion = tacoJson["cordova-cli"];
                    return projectInfo;
                } else {
                    return projectInfo;
                }
            }).then((projectInfo: IProjectInfo): IProjectInfo => {
                if (projectInfo.isTacoProject) {
                    ProjectHelper.cachedProjectInfo = Q(projectInfo);
                }
                return projectInfo;
            });
        }

        /**
         *  public helper that returns all the installed components - platforms/plugins
         */
        public static getInstalledComponents(projectDir: string, componentDirName: string): Q.Promise<string[]> {
            var components: string[] = [];
            projectDir = projectDir || ProjectHelper.getProjectRoot();
            var componentDir: string = path.join(projectDir, componentDirName);
            if (!fs.existsSync(componentDir)) {
                return Q.resolve(components);
            }

            components = fs.readdirSync(componentDir).filter(function(component: string): boolean {
                return fs.statSync(path.join(componentDir, component)).isDirectory();
            });

            return Q.resolve(components);
        }

        /**
         *  public helper that gets the version of the installed platforms
         */
        public static getInstalledPlatformVersions(projectDir: string): Q.Promise<any> {
            projectDir = projectDir || ProjectHelper.getProjectRoot();
            var onWindows: boolean = process.platform === "win32";
            var deferred: Q.Deferred<any> = Q.defer<any>();
            var platformVersions: IDictionary<string> = {};
            return ProjectHelper.getInstalledComponents(projectDir, "platforms")
                .then(function(platformsInstalled: string[]): Q.Promise<any> {
                    return Q.all(platformsInstalled.map(function(platform: string): Q.Promise<any> {
                        var deferredProcPromise: Q.Deferred<any> = Q.defer<any>();
                        var cmdName: string = "version";
                        if (onWindows) {
                            cmdName = cmdName + ".bat";
                        }

                        var cmdPath: string = path.join(projectDir, "platforms", platform, "cordova", cmdName);
                        var versionProc: child_process.ChildProcess = child_process.spawn(cmdPath);
                        versionProc.stdout.on("data", function(data: any): void {
                            var version: string = data.toString();
                            platformVersions[platform] = version.trim();
                            deferredProcPromise.resolve(version);
                        });
                        return deferredProcPromise.promise;
                    }));
                }).then(function(): Q.Promise<any> {
                    deferred.resolve(platformVersions);
                    return deferred.promise;
                });
        }

        /**
         *  public helper that gets the version of the installed plugins
         */
        public static getInstalledPluginVersions(projectDir: string): Q.Promise<any> {
            projectDir = projectDir || ProjectHelper.getProjectRoot();
            var pluginVersions: IDictionary<string> = {};
            return ProjectHelper.getInstalledComponents(projectDir, "plugins")
                .then(function(pluginsInstalled: string[]): Q.Promise<any> {
                    pluginsInstalled.forEach(function(plugin: string): void {
                        // Ignore plugins without a package.json
                        var pluginPackgeJson: string = path.join(projectDir, "plugins", plugin, "package.json");
                        if (fs.existsSync(pluginPackgeJson)) {
                            var pluginInfo: IDictionary<string> = require(pluginPackgeJson);
                            if (pluginInfo) {
                                pluginVersions[plugin] = pluginInfo["version"];
                            }
                        }
                    });
                    return Q.resolve(pluginVersions);
                });
        }

        /**
         *  public helper that gets the list of plugins that are 1. installed from the local file system or a GIT repository 2. that are not top-level plugins
         */
        public static getNonUpdatablePlugins(projectDir: string): Q.Promise<string[]> {
            projectDir = projectDir || ProjectHelper.getProjectRoot();
            var nonUpdatablePlugins: string[] = [];
            var fetchJsonPath: string = path.resolve(projectDir, "plugins", "fetch.json");

            if (!fs.existsSync(path.resolve(projectDir, "plugins", "fetch.json"))) {
                return Q.resolve(nonUpdatablePlugins);
            }

            try {
                var fetchJson: IPluginFetchInfo = require(fetchJsonPath);
                Object.keys(fetchJson).forEach(function(plugin: string): void {
                    if ((fetchJson[plugin].source && fetchJson[plugin].source.type !== "registry") || !fetchJson[plugin]["is_top_level"]) {
                        nonUpdatablePlugins.push(plugin);
                    }
                });
            } catch (error) {
                Logger.log(error);
            }

            return Q.resolve(nonUpdatablePlugins);
        }

        /**
         *  public helper that serializes the JSON blob {jsonData} passed to a file @ {tacoJsonPath}
         */
        public static createJsonFileWithContents(tacoJsonPath: string, jsonData: any): Q.Promise<any> {
            var deferred: Q.Deferred<any> = Q.defer<any>();

            // Write the JSON data to the file in the standard JSON format.
            // JsonSerializer class in the taco-utils does the necessary formatting
            // This is important as VS expects the JSON file to be in the standard JSON format
            var jsonSerializer: JsonSerializer = new JsonSerializer();
            var formattedTacoJson: string = jsonSerializer.serialize(jsonData);

            fs.writeFile(tacoJsonPath, formattedTacoJson, function(err: NodeJS.ErrnoException): void {
                if (err) {
                    deferred.reject(errorHelper.wrap(TacoErrorCodes.CommandCreateTacoJsonFileWriteError, err, tacoJsonPath));
                }

                deferred.resolve({});
            });
            return deferred.promise;
        }

        /**
         *  public helper that returns the common telemetry properties for the current project
         */
        public static getCurrentProjectTelemetryProperties(cliVersion: string): Q.Promise<ICommandTelemetryProperties> {
            var projectRoot: string = ProjectHelper.getProjectRoot();
            if (!projectRoot) {
                return Q.resolve(<ICommandTelemetryProperties>{});
            }

            return ProjectHelper.getProjectInfo().then(function(projectInfo: IProjectInfo): Q.Promise<ICommandTelemetryProperties> {
                var isTsProject: boolean = ProjectHelper.isTypeScriptProject();
                var projectTelemetryProperties: ICommandTelemetryProperties = {};
                if (projectInfo.isTacoProject) {
                    projectTelemetryProperties["isTacoProject"] = TelemetryHelper.telemetryProperty(true);
                    if (projectInfo.tacoKitId) {
                        projectTelemetryProperties["kit"] = TelemetryHelper.telemetryProperty(projectInfo.tacoKitId);
                    } else {
                        projectTelemetryProperties["cli"] = TelemetryHelper.telemetryProperty(projectInfo.cordovaCliVersion);
                    }
                } else {
                    projectTelemetryProperties["isTacoProject"] = TelemetryHelper.telemetryProperty(false);
                }

                projectTelemetryProperties["projectType"] = TelemetryHelper.telemetryProperty(isTsProject ? "TypeScript" : "JavaScript");
                projectTelemetryProperties["cliVersion"] = TelemetryHelper.telemetryProperty(cliVersion);
                return Q.resolve(projectTelemetryProperties);
            });
        }

        /**
         *  public helper that resolves with a true value if the current project is a TACO TS project
         */
        public static isTypeScriptProject(): boolean {
            var projectRoot: string = ProjectHelper.getProjectRoot();
            if (!projectRoot) {
                return false;
            }

            var projectScriptsPath: string = path.resolve(projectRoot, ProjectHelper.PROJECTS_SCRIPTS_DIR);
            var tsFiles: string[] = [];
            if (fs.existsSync(projectScriptsPath)) {
                tsFiles = wrench.readdirSyncRecursive(projectScriptsPath).filter(function(file: string): boolean {
                    return path.extname(file) === ".ts";
                });
            }

            return tsFiles.length > 0;
        }
    }
}

export = TacoUtility;
